"""
Wallet API Routes
Handles wallet operations: balance check, add funds, transfer money, transaction history,
and mock bank-to-wallet deposits.
"""
import hashlib
import time
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from models import db, User, Wallet, Transaction
from auth import jwt_required
from blockchain import add_block
from ml_model import predict_fraud
from config import Config

wallet_bp = Blueprint('wallet', __name__, url_prefix='/api/wallet')

# Simple in-memory lock to prevent duplicate deposit submissions
_deposit_processing = set()


def generate_wallet_id(user_id, email):
    """Generate a unique blockchain-based wallet ID using SHA-256."""
    payload = f"wallet-{user_id}-{email}-{datetime.utcnow().isoformat()}"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def create_wallet_for_user(user):
    """Create a wallet for a given user if one doesn't exist."""
    existing = Wallet.query.filter_by(user_id=user.id).first()
    if existing:
        return existing

    wallet = Wallet(
        user_id=user.id,
        wallet_id=generate_wallet_id(user.id, user.email),
        balance=0.0
    )
    db.session.add(wallet)
    db.session.commit()
    return wallet


def _get_status_label(score):
    if score < Config.WARNING_THRESHOLD:
        return 'Clear'
    if score < Config.FRAUD_THRESHOLD:
        return 'Review'
    return 'Suspicious'


# ─── Wallet Routes ───

@wallet_bp.route('/me', methods=['GET'])
@jwt_required
def get_wallet():
    """Get current user's wallet info."""
    user_id = g.current_user['user_id']
    wallet = Wallet.query.filter_by(user_id=user_id).first()

    if not wallet:
        # Auto-create wallet if missing
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        wallet = create_wallet_for_user(user)

    user = User.query.get(user_id)
    result = wallet.to_dict()
    result['email'] = user.email if user else ''
    return jsonify({'wallet': result}), 200


@wallet_bp.route('/add-funds', methods=['POST'])
@jwt_required
def add_funds():
    """Add demo funds to current user's wallet."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    amount = data.get('amount')
    if amount is None:
        return jsonify({'error': 'amount is required'}), 400

    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return jsonify({'error': 'amount must be a number'}), 400

    if amount <= 0:
        return jsonify({'error': 'amount must be positive'}), 400

    user_id = g.current_user['user_id']
    wallet = Wallet.query.filter_by(user_id=user_id).first()

    if not wallet:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        wallet = create_wallet_for_user(user)

    wallet.balance += amount
    db.session.commit()

    return jsonify({
        'message': f'₹{amount:.2f} added to wallet',
        'wallet': wallet.to_dict()
    }), 200


@wallet_bp.route('/transfer', methods=['POST'])
@jwt_required
def transfer():
    """Transfer money from current user's wallet to another user's wallet."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    receiver_wallet_id = (data.get('receiverWalletId') or '').strip()
    amount = data.get('amount')

    if not receiver_wallet_id:
        return jsonify({'error': 'Receiver wallet ID is required'}), 400

    if amount is None:
        return jsonify({'error': 'amount is required'}), 400

    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return jsonify({'error': 'amount must be a number'}), 400

    if amount <= 0:
        return jsonify({'error': 'amount must be positive'}), 400

    user_id = g.current_user['user_id']
    sender_wallet = Wallet.query.filter_by(user_id=user_id).first()

    if not sender_wallet:
        return jsonify({'error': 'Sender wallet not found'}), 404

    # Cannot send to yourself
    if sender_wallet.wallet_id == receiver_wallet_id:
        return jsonify({'error': 'Cannot transfer to your own wallet'}), 400

    # Check sufficient balance
    if sender_wallet.balance < amount:
        return jsonify({'error': f'Insufficient balance. Your balance is ₹{sender_wallet.balance:.2f}'}), 400

    # Find receiver wallet
    receiver_wallet = Wallet.query.filter_by(wallet_id=receiver_wallet_id).first()
    if not receiver_wallet:
        return jsonify({'error': 'Receiver wallet not found. Please check the wallet ID.'}), 404

    # Get sender and receiver info
    sender_user = User.query.get(user_id)
    receiver_user = User.query.get(receiver_wallet.user_id)
    sender_name = sender_user.email if sender_user else 'Unknown'
    receiver_name = receiver_user.email if receiver_user else 'Unknown'

    # Perform transfer
    transfer_status = 'Pending'
    tx_id = f"TX-{int(datetime.utcnow().timestamp() * 1000)}"

    try:
        # Deduct from sender
        sender_wallet.balance -= amount
        # Credit to receiver
        receiver_wallet.balance += amount

        # ML fraud prediction
        sender_freq = Transaction.query.filter(
            db.func.lower(Transaction.sender) == sender_name.lower()
        ).count() + 1
        receiver_freq = Transaction.query.filter(
            db.func.lower(Transaction.receiver) == receiver_name.lower()
        ).count() + 1
        fraud_score = predict_fraud(amount, sender_freq, receiver_freq)
        status_label = _get_status_label(fraud_score)

        # Create transaction record
        tx = Transaction(
            tx_id=tx_id,
            sender=sender_name,
            receiver=receiver_name,
            amount=amount,
            fraud_score=fraud_score,
            status=status_label,
            transfer_status='Completed'
        )
        db.session.add(tx)
        db.session.commit()

        # Add to blockchain
        block = add_block(tx_id)
        transfer_status = 'Completed'

        return jsonify({
            'message': f'₹{amount:.2f} transferred successfully',
            'transaction': tx.to_dict(),
            'block': block,
            'senderBalance': round(sender_wallet.balance, 2),
            'transferStatus': transfer_status
        }), 200

    except Exception as e:
        db.session.rollback()
        # Record failed transaction
        try:
            tx = Transaction(
                tx_id=tx_id,
                sender=sender_name,
                receiver=receiver_name,
                amount=amount,
                fraud_score=0.0,
                status='Clear',
                transfer_status='Failed'
            )
            db.session.add(tx)
            db.session.commit()
        except Exception:
            pass

        return jsonify({
            'error': 'Transfer failed. Please try again.',
            'transferStatus': 'Failed'
        }), 500


# ─── Mock Bank-to-Wallet Deposit ───

@wallet_bp.route('/deposit/mock', methods=['POST'])
@jwt_required
def mock_deposit():
    """Simulate a bank-to-wallet deposit (mock payment gateway)."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    amount = data.get('amount')
    payment_method = (data.get('paymentMethod') or 'upi').strip().lower()

    if amount is None:
        return jsonify({'error': 'amount is required'}), 400

    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return jsonify({'error': 'amount must be a number'}), 400

    if amount < 10:
        return jsonify({'error': 'Minimum deposit amount is ₹10'}), 400

    if payment_method not in ('upi', 'card', 'netbanking'):
        return jsonify({'error': 'Invalid payment method. Use upi, card, or netbanking.'}), 400

    user_id = g.current_user['user_id']

    # Prevent duplicate submissions for same user
    lock_key = f"deposit-{user_id}"
    if lock_key in _deposit_processing:
        return jsonify({'error': 'A deposit is already being processed. Please wait.'}), 429
    _deposit_processing.add(lock_key)

    try:
        wallet = Wallet.query.filter_by(user_id=user_id).first()
        if not wallet:
            user = User.query.get(user_id)
            if not user:
                return jsonify({'error': 'User not found'}), 404
            wallet = create_wallet_for_user(user)

        user = User.query.get(user_id)
        user_email = user.email if user else 'Unknown'

        # Simulate payment processing delay (2 seconds)
        time.sleep(2)

        # Generate mock payment ID
        pay_id = f"PAY_{uuid.uuid4().hex[:16].upper()}"
        tx_id = f"DEP-{int(datetime.utcnow().timestamp() * 1000)}"

        # Atomically credit wallet and create transaction
        wallet.balance += amount

        tx = Transaction(
            tx_id=tx_id,
            sender='Bank Deposit',
            receiver=user_email,
            amount=amount,
            fraud_score=0.0,
            status='Clear',
            transfer_status='Completed',
            type='deposit',
            payment_method=payment_method,
            payment_id=pay_id
        )
        db.session.add(tx)
        db.session.commit()

        return jsonify({
            'message': f'₹{amount:.2f} deposited to wallet successfully',
            'paymentId': pay_id,
            'transactionId': tx_id,
            'paymentMethod': payment_method,
            'amount': amount,
            'newBalance': round(wallet.balance, 2),
            'transaction': tx.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Deposit failed. Please try again.'}), 500

    finally:
        _deposit_processing.discard(lock_key)

@wallet_bp.route('/transactions', methods=['GET'])
@jwt_required
def wallet_transactions():
    """Get transfer history for the current user."""
    user_id = g.current_user['user_id']
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    email = user.email.lower()

    # Get transactions where user is sender or receiver
    transactions = Transaction.query.filter(
        db.or_(
            db.func.lower(Transaction.sender) == email,
            db.func.lower(Transaction.receiver) == email
        )
    ).order_by(Transaction.created_at.desc()).limit(50).all()

    return jsonify({
        'transactions': [t.to_dict() for t in transactions],
        'total': len(transactions)
    }), 200


@wallet_bp.route('/lookup/<wallet_id>', methods=['GET'])
@jwt_required
def lookup_wallet(wallet_id):
    """Look up a wallet ID to get the owner's email (for sending)."""
    wallet = Wallet.query.filter_by(wallet_id=wallet_id).first()
    if not wallet:
        return jsonify({'error': 'Wallet not found'}), 404

    user = User.query.get(wallet.user_id)
    return jsonify({
        'walletId': wallet.wallet_id,
        'email': user.email if user else 'Unknown',
        'found': True
    }), 200
