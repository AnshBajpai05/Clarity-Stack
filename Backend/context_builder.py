from sqlalchemy.orm import Session
from sqlalchemy import select, or_, and_
from models import Message
from typing import List

def build_chat_context(db: Session, chat_id: str, limit: int = 15) -> str:
    """
    Fetches relevant history for a chat and formats it into a context block.
    
    Rules:
    1. Include User messages (role='user').
    2. Include Accepted AI replies (role='assistant' AND accepted=True).
    3. Include Synthesis messages (role='synthesis').
    4. Exclude noise (if signal_level='noise').
    5. Sort chronologically.
    6. Limit to last `limit` items to conserve context window.
    """
    
    # 1. Fetch messages with filters
    stmt = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .where(
            or_(
                # Valid user messages (not noise)
                and_(Message.role == "user", Message.signal_level != "noise"),
                
                # Accepted AI answers
                and_(Message.role == "assistant", Message.accepted == True),
                
                # Synthesis is always truth
                Message.role == "synthesis"
            )
        )
        .order_by(Message.created_at.desc())  # Get latest first for limiting
        .limit(limit)
    )
    
    # Execute and flip to chronological order
    history = list(db.scalars(stmt))
    history.reverse()
    
    if not history:
        return ""

    # 2. Format into a structured block
    buffer = ["\n=== RELEVANT CONVERSATION HISTORY (Use this for context) ==="]
    
    for msg in history:
        role_label = msg.role.upper()
        if msg.role == "assistant" and msg.accepted:
            role_label = "ACCEPTED_ANSWER"
        elif msg.role == "synthesis":
            role_label = "APPROVED_SUMMARY"
            
        # Clean content slightly
        content = msg.text.strip()
        
        buffer.append(f"[{role_label}]:\n{content}\n")
        
    buffer.append("=== END HISTORY ===\n")
    
    return "\n".join(buffer)
