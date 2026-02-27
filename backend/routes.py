"""
API Routes for Transactions, Dashboard, Fraud Alerts, Blockchain, and Reports.
All routes require JWT authentication.
"""
import csv
import io
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g, Response
from models import db, Transaction, Block
from auth import jwt_required
from blockchain import add_block, get_chain, validate_chain
from ml_model import predict_fraud, train_model, get_model_status
from config import Config

api_bp = Blueprint('api', __name__, url_prefix='/api')


def _get_sender_freq(sender):
    """Get how many transactions this sender has made."""
    return Transaction.query.filter(db.func.lower(Transaction.sender) == sender.lower()).count()


def _get_receiver_freq(receiver):
    """Get how many transactions this receiver has received."""
    return Transaction.query.filter(db.func.lower(Transaction.receiver) == receiver.lower()).count()


def _retrain_model():
    """Retrain the ML model on all existing transactions."""
    transactions = Transaction.query.all()
    if len(transactions) < 10:
        return

    data = []
    sender_counts = {}
    receiver_counts = {}

    for t in transactions:
        s = t.sender.lower()
        r = t.receiver.lower()
        sender_counts[s] = sender_counts.get(s, 0) + 1
        receiver_counts[r] = receiver_counts.get(r, 0) + 1

    for t in transactions:
        data.append({
            'amount': t.amount,
            'sender_freq': sender_counts.get(t.sender.lower(), 1),
            'receiver_freq': receiver_counts.get(t.receiver.lower(), 1),
            'hour': t.created_at.hour if t.created_at else 12,
            'day_of_week': t.created_at.weekday() if t.created_at else 0
        })

    train_model(data)


def _get_status_label(score):
    if score < Config.WARNING_THRESHOLD:
        return 'Clear'
    if score < Config.FRAUD_THRESHOLD:
        return 'Review'
    return 'Suspicious'


# ─── Transactions ───

@api_bp.route('/transactions', methods=['POST'])
@jwt_required
def create_transaction():
    """Create a new transaction with ML fraud scoring and blockchain recording."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    sender = (data.get('sender') or '').strip()
    receiver = (data.get('receiver') or '').strip()
    amount = data.get('amount')

    if not sender or not receiver or amount is None:
        return jsonify({'error': 'sender, receiver, and amount are required'}), 400

    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return jsonify({'error': 'amount must be a number'}), 400

    if amount <= 0:
        return jsonify({'error': 'amount must be positive'}), 400

    # Get frequency features
    sender_freq = _get_sender_freq(sender) + 1
    receiver_freq = _get_receiver_freq(receiver) + 1

    # ML fraud prediction
    fraud_score = predict_fraud(amount, sender_freq, receiver_freq)
    status = _get_status_label(fraud_score)

    # Create transaction
    tx_id = f"TX-{int(datetime.utcnow().timestamp() * 1000)}"
    tx = Transaction(
        tx_id=tx_id,
        sender=sender,
        receiver=receiver,
        amount=amount,
        fraud_score=fraud_score,
        status=status
    )
    db.session.add(tx)
    db.session.commit()

    # Add block to blockchain
    block = add_block(tx_id)

    # Retrain model periodically
    tx_count = Transaction.query.count()
    if tx_count % 10 == 0:
        _retrain_model()

    return jsonify({
        'transaction': tx.to_dict(),
        'block': block,
        'mlStatus': get_model_status()
    }), 201


@api_bp.route('/transactions', methods=['GET'])
@jwt_required
def list_transactions():
    """List transactions with optional search, filter, and pagination."""
    search = request.args.get('search', '').strip()
    status_filter = request.args.get('status', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)

    query = Transaction.query

    if search:
        like = f'%{search}%'
        query = query.filter(
            db.or_(
                Transaction.sender.ilike(like),
                Transaction.receiver.ilike(like),
                Transaction.tx_id.ilike(like),
                db.cast(Transaction.amount, db.String).ilike(like)
            )
        )

    if status_filter:
        query = query.filter(Transaction.status == status_filter)

    query = query.order_by(Transaction.created_at.desc())
    total = query.count()
    transactions = query.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        'transactions': [t.to_dict() for t in transactions],
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': max(1, (total + per_page - 1) // per_page)
    }), 200


@api_bp.route('/transactions/<tx_id>', methods=['GET'])
@jwt_required
def get_transaction(tx_id):
    """Get a single transaction by ID with its blockchain block."""
    tx = Transaction.query.filter_by(tx_id=tx_id).first()
    if not tx:
        return jsonify({'error': 'Transaction not found'}), 404

    block = Block.query.filter_by(transaction_id=tx_id).first()
    result = tx.to_dict()
    result['block'] = block.to_dict() if block else None

    return jsonify({'transaction': result}), 200


# ─── Fraud Alerts ───

@api_bp.route('/fraud-alerts', methods=['GET'])
@jwt_required
def get_fraud_alerts():
    """Get all transactions flagged as suspicious (fraud score >= threshold)."""
    transactions = Transaction.query.filter(
        Transaction.fraud_score >= Config.FRAUD_THRESHOLD
    ).order_by(Transaction.created_at.desc()).all()

    return jsonify({
        'alerts': [t.to_dict() for t in transactions],
        'total': len(transactions)
    }), 200


# ─── Blockchain ───

@api_bp.route('/blockchain', methods=['GET'])
@jwt_required
def get_blockchain():
    """Get the full blockchain ledger."""
    chain = get_chain()
    validation = validate_chain()
    return jsonify({
        'chain': chain,
        'validation': validation
    }), 200


# ─── Dashboard ───

@api_bp.route('/dashboard/stats', methods=['GET'])
@jwt_required
def get_dashboard_stats():
    """Get dashboard KPI stats, risk score, weekly activity, and recent alerts."""
    total = Transaction.query.count()
    suspicious = Transaction.query.filter(
        Transaction.fraud_score >= Config.FRAUD_THRESHOLD
    ).count()
    fraud_rate = round((suspicious / total * 100), 1) if total > 0 else 0

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_count = Transaction.query.filter(Transaction.created_at >= today_start).count()

    # Risk score (average fraud score)
    all_txs = Transaction.query.all()
    risk_score = 0
    if all_txs:
        risk_score = round(sum(t.fraud_score for t in all_txs) / len(all_txs) * 100)

    # Weekly activity (last 7 days)
    weekly = []
    day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    now = datetime.utcnow()
    for d in range(6, -1, -1):
        day = now - timedelta(days=d)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        day_txs = Transaction.query.filter(
            Transaction.created_at >= day_start,
            Transaction.created_at < day_end
        ).all()

        day_total = len(day_txs)
        day_fraud = len([t for t in day_txs if t.fraud_score >= Config.FRAUD_THRESHOLD])
        weekday_idx = day.weekday()

        weekly.append({
            'day': day_names[weekday_idx],
            'total': day_total,
            'fraud': day_fraud,
            'fraudPct': round((day_fraud / day_total * 100), 1) if day_total > 0 else 0
        })

    # Recent 5 transactions
    recent = Transaction.query.order_by(Transaction.created_at.desc()).limit(5).all()

    return jsonify({
        'total': total,
        'suspicious': suspicious,
        'fraudRate': fraud_rate,
        'todayCount': today_count,
        'riskScore': risk_score,
        'weekly': weekly,
        'recent': [t.to_dict() for t in recent],
        'mlStatus': get_model_status()
    }), 200


# ─── Reports ───

@api_bp.route('/reports', methods=['GET'])
@jwt_required
def get_reports():
    """Get report data for charts: fraud distribution and monthly breakdown."""
    date_filter = request.args.get('filter', 'month')
    now = datetime.utcnow()

    if date_filter == 'quarter':
        start = now - timedelta(days=90)
        num_months = 3
    elif date_filter == 'year':
        start = now - timedelta(days=365)
        num_months = 12
    else:
        start = now - timedelta(days=30)
        num_months = 6

    transactions = Transaction.query.filter(Transaction.created_at >= start).all()

    clear = len([t for t in transactions if t.fraud_score < Config.WARNING_THRESHOLD])
    review = len([t for t in transactions if Config.WARNING_THRESHOLD <= t.fraud_score < Config.FRAUD_THRESHOLD])
    suspicious_count = len([t for t in transactions if t.fraud_score >= Config.FRAUD_THRESHOLD])

    # Monthly breakdown
    monthly = []
    for i in range(num_months - 1, -1, -1):
        month_date = datetime(now.year, now.month, 1) - timedelta(days=i * 30)
        m_start = datetime(month_date.year, month_date.month, 1)
        if month_date.month == 12:
            m_end = datetime(month_date.year + 1, 1, 1)
        else:
            m_end = datetime(month_date.year, month_date.month + 1, 1)

        m_txs = [t for t in transactions if m_start <= t.created_at < m_end]
        label = m_start.strftime('%b %y')

        monthly.append({
            'label': label,
            'clear': len([t for t in m_txs if t.fraud_score < Config.WARNING_THRESHOLD]),
            'review': len([t for t in m_txs if Config.WARNING_THRESHOLD <= t.fraud_score < Config.FRAUD_THRESHOLD]),
            'suspicious': len([t for t in m_txs if t.fraud_score >= Config.FRAUD_THRESHOLD])
        })

    return jsonify({
        'distribution': {
            'clear': clear,
            'review': review,
            'suspicious': suspicious_count,
            'total': len(transactions)
        },
        'monthly': monthly
    }), 200


# ─── CSV Export ───

@api_bp.route('/transactions/export', methods=['GET'])
@jwt_required
def export_transactions():
    """Export all transactions as CSV."""
    transactions = Transaction.query.order_by(Transaction.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Sender', 'Receiver', 'Amount', 'Fraud Score', 'Status', 'Date'])

    for t in transactions:
        writer.writerow([
            t.tx_id, t.sender, t.receiver, t.amount,
            f"{t.fraud_score * 100:.2f}%", t.status,
            t.created_at.isoformat() if t.created_at else ''
        ])

    csv_output = output.getvalue()
    output.close()

    return Response(
        csv_output,
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename=securechain-transactions-{datetime.utcnow().strftime("%Y-%m-%d")}.csv'}
    )
