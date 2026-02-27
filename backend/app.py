"""
SecureChain – Business Fraud Detection System
Flask Application Entry Point
"""
import pymysql
from flask import Flask
from flask_cors import CORS
from config import Config
from models import db
from auth import auth_bp, hash_password
from routes import api_bp
from wallet import wallet_bp

pymysql.install_as_MySQLdb()


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Enable CORS for frontend (allow all origins on all routes)
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

    # Initialize database
    db.init_app(app)

    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(wallet_bp)

    # Create tables and seed admin on first run
    with app.app_context():
        _ensure_database_exists()
        db.create_all()
        _run_migrations()
        _seed_admin()

    return app


def _run_migrations():
    """Add new columns/tables to existing database if missing."""
    from sqlalchemy import text
    try:
        # Add transfer_status column to transactions if missing
        db.session.execute(text(
            "ALTER TABLE transactions ADD COLUMN transfer_status VARCHAR(50) NOT NULL DEFAULT 'Completed'"
        ))
        db.session.commit()
        print("[OK] Added 'transfer_status' column to transactions table")
    except Exception:
        db.session.rollback()  # Column already exists, ignore

    try:
        db.session.execute(text(
            "ALTER TABLE transactions ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'transfer'"
        ))
        db.session.commit()
        print("[OK] Added 'type' column to transactions table")
    except Exception:
        db.session.rollback()

    try:
        db.session.execute(text(
            "ALTER TABLE transactions ADD COLUMN payment_method VARCHAR(50) NULL"
        ))
        db.session.commit()
        print("[OK] Added 'payment_method' column to transactions table")
    except Exception:
        db.session.rollback()

    try:
        db.session.execute(text(
            "ALTER TABLE transactions ADD COLUMN payment_id VARCHAR(100) NULL"
        ))
        db.session.commit()
        print("[OK] Added 'payment_id' column to transactions table")
    except Exception:
        db.session.rollback()


def _ensure_database_exists():
    """Create the database if it doesn't exist."""
    try:
        conn = pymysql.connect(
            host=Config.DB_HOST,
            port=int(Config.DB_PORT),
            user=Config.DB_USER,
            password=Config.DB_PASSWORD
        )
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{Config.DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        conn.commit()
        cursor.close()
        conn.close()
        print(f"[OK] Database '{Config.DB_NAME}' ready")
    except Exception as e:
        print(f"[WARNING] Could not auto-create database: {e}")
        print("Make sure MySQL is running and credentials in config.py are correct.")


def _seed_admin():
    """Create a default admin user if no users exist."""
    from models import User
    from wallet import create_wallet_for_user
    if User.query.count() == 0:
        admin = User(
            email='admin@securechain.com',
            password_hash=hash_password('admin123'),
            role='Admin'
        )
        db.session.add(admin)
        db.session.commit()
        create_wallet_for_user(admin)
        print("[OK] Default admin created: admin@securechain.com / admin123")
    else:
        # Ensure all existing users have wallets
        users = User.query.all()
        for u in users:
            create_wallet_for_user(u)


if __name__ == '__main__':
    app = create_app()
    print("\n" + "=" * 55)
    print("  SecureChain Backend – Fraud Detection System")
    print("  Running on http://127.0.0.1:5000")
    print("=" * 55 + "\n")
    app.run(debug=True, host='0.0.0.0', port=5000)
