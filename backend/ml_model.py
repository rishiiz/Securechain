"""
ML Fraud Detection Model
Uses Scikit-learn Isolation Forest for anomaly-based fraud scoring.
Features: amount, sender frequency, receiver frequency, hour of day, day of week.
"""
import numpy as np
from sklearn.ensemble import IsolationForest
from datetime import datetime

# Global model instance
_model = None
_is_trained = False
_MIN_SAMPLES_TO_TRAIN = 10


def _extract_features(amount, sender_freq, receiver_freq, hour=None, day_of_week=None):
    """Extract feature vector for a single transaction."""
    if hour is None:
        hour = datetime.utcnow().hour
    if day_of_week is None:
        day_of_week = datetime.utcnow().weekday()
    return [
        float(amount),
        float(sender_freq),
        float(receiver_freq),
        float(hour),
        float(day_of_week),
        float(amount) ** 0.5,  # sqrt of amount to capture non-linear patterns
    ]


def train_model(transactions_data):
    """
    Train the Isolation Forest model on historical transaction data.
    transactions_data: list of dicts with keys:
        amount, sender_freq, receiver_freq, hour, day_of_week
    """
    global _model, _is_trained

    if len(transactions_data) < _MIN_SAMPLES_TO_TRAIN:
        _is_trained = False
        return False

    features = []
    for t in transactions_data:
        features.append(_extract_features(
            t['amount'],
            t.get('sender_freq', 1),
            t.get('receiver_freq', 1),
            t.get('hour', 12),
            t.get('day_of_week', 0)
        ))

    X = np.array(features)

    _model = IsolationForest(
        n_estimators=100,
        contamination=0.15,  # expect ~15% anomalies
        random_state=42,
        max_samples='auto'
    )
    _model.fit(X)
    _is_trained = True
    return True


def predict_fraud(amount, sender_freq=1, receiver_freq=1):
    """
    Predict fraud score for a transaction.
    Returns a float between 0.0 (safe) and 1.0 (highly suspicious).
    If model is not trained, uses rule-based heuristic.
    """
    global _model, _is_trained

    hour = datetime.utcnow().hour
    day_of_week = datetime.utcnow().weekday()

    if _is_trained and _model is not None:
        features = np.array([_extract_features(amount, sender_freq, receiver_freq, hour, day_of_week)])
        # decision_function: higher = more normal, lower = more anomalous
        raw_score = _model.decision_function(features)[0]
        # Normalize: convert from [-0.5, 0.5] range to [0, 1] where 1 = most suspicious
        fraud_score = max(0.0, min(1.0, 0.5 - raw_score))
    else:
        # Rule-based fallback when not enough data
        fraud_score = _rule_based_score(amount, sender_freq, receiver_freq, hour)

    return round(fraud_score, 3)


def _rule_based_score(amount, sender_freq, receiver_freq, hour):
    """
    Simple rule-based fraud scoring as a fallback.
    Uses amount thresholds, frequency analysis, and time patterns.
    """
    score = 0.0

    # Large amounts are more suspicious
    if amount > 50000:
        score += 0.35
    elif amount > 10000:
        score += 0.2
    elif amount > 5000:
        score += 0.1

    # Round amounts can be suspicious (money laundering patterns)
    if amount > 0 and amount % 1000 == 0:
        score += 0.05

    # High-frequency senders/receivers
    if sender_freq > 10:
        score += 0.15
    elif sender_freq > 5:
        score += 0.08

    if receiver_freq > 10:
        score += 0.15
    elif receiver_freq > 5:
        score += 0.08

    # Late-night transactions are more suspicious
    if hour < 6 or hour > 22:
        score += 0.1

    # Add small random noise for realistic variation
    noise = (hash(str(amount) + str(sender_freq) + str(hour)) % 100) / 500.0
    score += noise

    return max(0.0, min(0.95, score))


def get_model_status():
    """Return the current status of the ML model."""
    return {
        'trained': _is_trained,
        'algorithm': 'Isolation Forest',
        'minSamples': _MIN_SAMPLES_TO_TRAIN
    }
