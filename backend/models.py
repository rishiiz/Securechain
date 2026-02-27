from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='User')  # Admin, Manager, User
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'role': self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Transaction(db.Model):
    __tablename__ = 'transactions'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    tx_id = db.Column(db.String(100), unique=True, nullable=False, index=True)
    sender = db.Column(db.String(255), nullable=False)
    receiver = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    fraud_score = db.Column(db.Float, nullable=False, default=0.0)
    status = db.Column(db.String(50), nullable=False, default='Clear')  # Clear, Review, Suspicious
    transfer_status = db.Column(db.String(50), nullable=False, default='Completed')  # Pending, Completed, Failed
    type = db.Column(db.String(20), nullable=False, default='transfer')  # transfer, deposit
    payment_method = db.Column(db.String(50), nullable=True)  # upi, card, netbanking (for deposits)
    payment_id = db.Column(db.String(100), nullable=True)  # mock payment ID (for deposits)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.tx_id,
            'sender': self.sender,
            'receiver': self.receiver,
            'amount': self.amount,
            'fraudScore': round(self.fraud_score, 3),
            'status': self.status,
            'transferStatus': self.transfer_status,
            'type': self.type or 'transfer',
            'paymentMethod': self.payment_method,
            'paymentId': self.payment_id,
            'date': self.created_at.isoformat() if self.created_at else None
        }


class Block(db.Model):
    __tablename__ = 'blockchain'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    block_index = db.Column(db.Integer, nullable=False)
    transaction_id = db.Column(db.String(100), nullable=False)
    previous_hash = db.Column(db.String(255), nullable=False)
    current_hash = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'index': self.block_index,
            'transactionId': self.transaction_id,
            'previousHash': self.previous_hash,
            'currentHash': self.current_hash,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }


class Wallet(db.Model):
    __tablename__ = 'wallets'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    wallet_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    balance = db.Column(db.Float, nullable=False, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('wallet', uselist=False))

    def to_dict(self):
        return {
            'walletId': self.wallet_id,
            'balance': round(self.balance, 2),
            'userId': self.user_id,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }
