# Fraud Detection System - Prototype 2

This project is a sophisticated Business Fraud Detection System that leverages **Blockchain Technology** for data integrity and **Artificial Intelligence** for fraud scoring.

## 🔗 Blockchain Technology

The system implements a simulated blockchain service to ensure the immutability and transparency of transaction logs.

### ⚙️ How it Works
1.  **Immutable Chain**: Every time a transaction is recorded, it is encapsulated in a "Block". This block is linked to the previous one using SHA-256 cryptographic hashing.
2.  **Hashing Mechanism**: Each block contains:
    -   `transaction_id`: Reference to the core application data.
    -   `previous_hash`: The unique fingerprint of the prior block.
    -   `current_hash`: A combined hash of the transaction ID, the previous hash, and a timestamp.
3.  **Data Integrity**: If any historical transaction data is tampered with, the hash links will break, and the `validate_chain` process will immediately flag the discrepancy.

### 🛡️ Why Blockchain?
-   **Anti-Tampering**: Ensures that once a fraud alert or transaction is logged, it cannot be deleted or modified without detection.
-   **Transparency**: Provides a clear audit trail for compliance and forensic analysis.

---

## 🧠 Fraud Score Generation

The system uses advanced Machine Learning and Rule-Based heuristics to calculate a **Fraud Score** between `0.0` (Safe) and `1.0` (Highly Suspicious).

### 🤖 AI Model (Isolation Forest)
For established systems with sufficient data, we use the **Isolation Forest** algorithm:
-   **Concept**: Instead of learning what "fraud" looks like, it learns what "normal" looks like and flags anything that stands out as an anomaly.
-   **Features Analyzed**:
    -   **Transaction Amount**: Flags atypical value spikes.
    -   **Sender/Receiver Frequency**: Detects rapid-fire transactions (Potential bot/shell behavior).
    -   **Time of Day**: Identifies high-risk activity windows (e.g., late-night transfers).
    -   **Sequence Patterns**: Looks at the non-linear relationship between amount and frequency.

### 📋 Rule-Based Fallback (Heuristics)
To ensure immediate protection (Cold Start), the system employs a specialized rule engine:
-   **Threshold Traps**: Automatic score increases for transactions over $5,000, $10,000, and $50,000.
-   **Pattern Matching**: Detection of "Round Numbers" which are common in money laundering.
-   **Frequency Caps**: penalizes entities performing more than 5-10 transactions in a short window.
-   **Night Owls**: Adds a risk weight to transactions occurring between 10:00 PM and 6:00 AM.

---

## 🚀 Getting Started

1.  **Backend**: Navigate to `backend/` and run `python app.py`.
2.  **Frontend**: Open `index.html` in your browser.
3.  **Monitoring**: Use the dashboard to view real-time fraud scores and the blockchain ledger.
