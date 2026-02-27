"""
JWT Authentication Module
Handles user registration, login, token generation/validation, and admin user management.
"""
import jwt
import bcrypt
from functools import wraps
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from models import db, User
from config import Config

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def check_password(password: str, hashed: str) -> bool:
    """Verify a password against its bcrypt hash."""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def generate_token(user_id: int, email: str, role: str) -> str:
    """Generate a JWT token for the authenticated user."""
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRY_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm='HS256')


def jwt_required(f):
    """Decorator to require a valid JWT token for a route."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]

        if not token:
            return jsonify({'error': 'Authentication token required'}), 401

        try:
            payload = jwt.decode(token, Config.JWT_SECRET, algorithms=['HS256'])
            g.current_user = {
                'user_id': payload['user_id'],
                'email': payload['email'],
                'role': payload['role']
            }
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401

        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator to require Admin role."""
    @wraps(f)
    @jwt_required
    def decorated(*args, **kwargs):
        if g.current_user.get('role') != 'Admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


# ─── Routes ───

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    password = data.get('password', '')
    role = data.get('role', 'User')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    if len(password) < 4:
        return jsonify({'error': 'Password must be at least 4 characters'}), 400

    if role not in ('User', 'Manager', 'Admin'):
        role = 'User'

    existing = User.query.filter(db.func.lower(User.email) == email).first()
    if existing:
        return jsonify({'error': 'An account with this email already exists'}), 409

    user = User(
        email=email,
        password_hash=hash_password(password),
        role=role
    )
    db.session.add(user)
    db.session.commit()

    # Auto-create wallet for new user
    from wallet import create_wallet_for_user
    wallet = create_wallet_for_user(user)

    token = generate_token(user.id, user.email, user.role)
    user_data = user.to_dict()
    user_data['walletId'] = wallet.wallet_id if wallet else None
    return jsonify({
        'message': 'Account created successfully',
        'user': user_data,
        'token': token
    }), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    """Authenticate user and return JWT token."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user = User.query.filter(db.func.lower(User.email) == email).first()
    if not user or not check_password(password, user.password_hash):
        return jsonify({'error': 'Invalid email or password'}), 401

    token = generate_token(user.id, user.email, user.role)
    return jsonify({
        'message': 'Login successful',
        'user': user.to_dict(),
        'token': token
    }), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required
def get_me():
    """Get current authenticated user info."""
    user = User.query.get(g.current_user['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': user.to_dict()}), 200


# ─── Admin User Management ───

@auth_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    """List all users (Admin only)."""
    users = User.query.order_by(User.created_at.asc()).all()
    return jsonify({'users': [u.to_dict() for u in users]}), 200


@auth_bp.route('/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Update a user's role or password (Admin only)."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json() or {}
    if 'role' in data and data['role'] in ('User', 'Manager', 'Admin'):
        user.role = data['role']
    if 'password' in data and data['password'].strip():
        user.password_hash = hash_password(data['password'].strip())

    db.session.commit()
    return jsonify({'message': 'User updated', 'user': user.to_dict()}), 200


@auth_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete a user account (Admin only). Cannot delete yourself."""
    if user_id == g.current_user['user_id']:
        return jsonify({'error': 'Cannot delete your own account'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'User deleted'}), 200
