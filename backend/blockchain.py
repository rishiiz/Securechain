"""
Simulated Blockchain Service
Uses SHA-256 hashing to create an immutable chain of blocks.
Each block contains a transaction reference and is linked to the previous block.
"""
import hashlib
from datetime import datetime
from models import db, Block


def compute_hash(data: str) -> str:
    """Compute SHA-256 hash of the given data string."""
    return hashlib.sha256(data.encode('utf-8')).hexdigest()


def get_chain():
    """Return the full blockchain as a list of dicts, ordered by index."""
    blocks = Block.query.order_by(Block.block_index.asc()).all()
    return [b.to_dict() for b in blocks]


def get_last_block():
    """Get the last block in the chain."""
    return Block.query.order_by(Block.block_index.desc()).first()


def add_block(transaction_id: str) -> dict:
    """
    Create a new block for the given transaction and append it to the chain.
    Returns the new block as a dict.
    """
    last = get_last_block()
    prev_hash = last.current_hash if last else '0' * 64
    new_index = (last.block_index + 1) if last else 0

    now = datetime.utcnow()
    payload = f"{transaction_id}{prev_hash}{now.isoformat()}{new_index}"
    current_hash = compute_hash(payload)

    block = Block(
        block_index=new_index,
        transaction_id=transaction_id,
        previous_hash=prev_hash,
        current_hash=current_hash,
        timestamp=now
    )
    db.session.add(block)
    db.session.commit()

    return block.to_dict()


def validate_chain() -> dict:
    """
    Validate the integrity of the entire blockchain.
    Returns { valid: bool, errors: list }
    """
    blocks = Block.query.order_by(Block.block_index.asc()).all()
    errors = []

    for i in range(1, len(blocks)):
        if blocks[i].previous_hash != blocks[i - 1].current_hash:
            errors.append(
                f"Block #{blocks[i].block_index}: previous_hash mismatch "
                f"(expected {blocks[i - 1].current_hash}, got {blocks[i].previous_hash})"
            )

    return {'valid': len(errors) == 0, 'errors': errors, 'totalBlocks': len(blocks)}
