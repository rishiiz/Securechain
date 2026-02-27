import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'securechain-secret-key-change-in-production')
    JWT_SECRET = os.environ.get('JWT_SECRET', 'securechain-jwt-secret-2024')
    JWT_EXPIRY_HOURS = 24

    # MySQL connection
    DB_USER = os.environ.get('DB_USER', 'root')
    DB_PASSWORD = os.environ.get('DB_PASSWORD', 'Avishkar1212')
    DB_HOST = os.environ.get('DB_HOST', 'localhost')
    DB_PORT = os.environ.get('DB_PORT', '3306')
    DB_NAME = os.environ.get('DB_NAME', 'securechain_db')

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ML
    FRAUD_THRESHOLD = 0.7
    WARNING_THRESHOLD = 0.4
