from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    Text,
    Index,
    Integer,
    Boolean,
    Float
)
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime
import uuid



Base = declarative_base()

def gen_id():
    return str(uuid.uuid4())

from datetime import datetime, timezone
def now():
    return datetime.now(timezone.utc)



from sqlalchemy import Column, String, DateTime, Text


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String(50), default="user", nullable=False)


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String(255), nullable=False)

    purpose = Column(Text, nullable=False)
    success_criteria = Column(Text, nullable=False)
    constraints = Column(Text, nullable=False)
    owner = Column(String(255), nullable=True)
    visibility = Column(String(50), default="private", nullable=False)

    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_email = Column(String(255), nullable=False, index=True)
    role = Column(String(50), default="member", nullable=False)  # "pm", "member", "viewer"

class ProjectActivityLog(Base):
    __tablename__ = "project_activity_logs"

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_email = Column(String(255), nullable=False, index=True)
    action = Column(String(255), nullable=False) # "user_joined", "user_removed", "request_approved", "role_changed", "knowledge_updated"
    details = Column(Text, nullable=True) # JSON or text string with extra context
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)

class JoinRequest(Base):
    __tablename__ = "join_requests"

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_email = Column(String(255), nullable=False, index=True)
    status = Column(String(50), default="pending", nullable=False)  # "pending", "accepted", "rejected"
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class Chat(Base):
    __tablename__ = "chats"

    id = Column(String, primary_key=True, default=gen_id)

    project_id = Column(
        String,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    title = Column(String(255), nullable=True)
    source_type = Column(String(100), nullable=True)

    archived = Column(Boolean, nullable=False, server_default='0')
    pinned = Column(Boolean, default=False, nullable=False)

    external_chat_id = Column(String(255), nullable=True)

    # ------------- 🆕 CHAT CONTEXT FIELDS -------------
    purpose = Column(
        Text,
        nullable=False,
        server_default="Chat purpose not yet defined."
    )

    phase = Column(String(255), nullable=True)

    description = Column(Text, nullable=True)

    owner = Column(String(255), nullable=True)
    # --------------------------------------------------

    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)



class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=gen_id)

    chat_id = Column(
        String,
        ForeignKey("chats.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    role = Column(String(50), nullable=True)
    sender = Column(String(255), nullable=True)
    type = Column(String(50), nullable=True)

    text = Column(Text, nullable=False)

    source_message_id = Column(String(255), nullable=True)

    include_in_summary = Column(Boolean, default=True, nullable=False)

    has_attachments = Column(Boolean, default=False, nullable=False)
    attachments_json = Column(Text, nullable=True)

    topic = Column(String(255), nullable=True)
    accepted = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
    ingested_at = Column(DateTime(timezone=True), default=now, nullable=False)

    reply_group_id = Column(String(100), nullable=True, index=True)
    signal_level = Column(String(20), nullable=True)
    synthesis_id = Column(String, ForeignKey("synthesis.id", ondelete="SET NULL"), index=True, nullable=True)


    


class QuarantinedMessage(Base):
    __tablename__ = "quarantined_messages"

    id = Column(String, primary_key=True, default=gen_id)

    chat_id = Column(String, nullable=True)

    raw_payload = Column(Text, nullable=False)   # store original request JSON
    error_reason = Column(String(500), nullable=False)

    created_at = Column(DateTime(timezone=True), default=now, nullable=False)



class Card(Base):
    __tablename__ = "cards"

    id = Column(String, primary_key=True, default=gen_id)

    project_id = Column(
        String,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Short title / label for the card
    title = Column(String(255), nullable=False)

    # e.g., decision / risk / plan / note / requirement
    kind = Column(String(100), nullable=True)

    # ---- PHASE / GROUP CONTEXT ----
    # e.g., "Exploration", "Design", "Implementation", "Testing"
    phase = Column(String(255), nullable=True)

    # Manual ordering within a phase (lower = earlier)
    ordering = Column(Integer, nullable=True)

    # Pin card to top regardless of sort
    pinned = Column(Boolean, default=False)

    # ---- STATUS ----
    # active = currently relevant
    # archived = not shown, but history preserved
    # deleted = soft-delete (optional)
    status = Column(String(50), default="active", nullable=False)

    # ---- VERSION POINTER ----
    # always points to latest approved version
    current_version_id = Column(String, nullable=True)

    # ---- TIMESTAMPS ----
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)
    latest_at = Column(DateTime(timezone=True), default=now, nullable=False)


    tags_json = Column(Text, nullable=True)

    review_state = Column(String(50), default="approved")




class CardVersion(Base):
    __tablename__ = "card_versions"

    id = Column(String, primary_key=True, default=gen_id)

    card_id = Column(
        String,
        ForeignKey("cards.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Full structured summary content
    body = Column(Text, nullable=False)

    # Optional short-summary
    summary = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now, nullable=False)
    created_by = Column(String(255), nullable=True)

    # If created by AI → still requires human approval to activate
    is_ai_generated = Column(Boolean, default=False)

    reverted_from_version_id = Column(String, nullable=True)

    source_refs = Column(Text, nullable=True)

    confidence = Column(Integer, nullable=True)
    

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func


class Synthesis(Base):
    __tablename__ = "synthesis"

    id = Column(String, primary_key=True, default=gen_id)

    chat_id = Column(
        String,
        ForeignKey("chats.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    reply_group_id = Column(
        String(100),
        nullable=False,
        index=True
    )

    # Final structured synthesis text
    content = Column(Text, nullable=False)

    # Optional — track LLM/model/version used
    model_used = Column(String(100), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("chat_id", "reply_group_id", name="uq_chat_replygroup"),
    )


# Recommended indexes
Index("idx_messages_chatid_createdat", Message.chat_id, Message.created_at)
Index("idx_cards_project_phase", Card.project_id, Card.phase)
Index("idx_cards_latest", Card.latest_at)
Index("idx_quarantine_chatid", QuarantinedMessage.chat_id)

class KnowledgeNode(Base):
    __tablename__ = "knowledge_nodes"

    id = Column(String, primary_key=True, default=gen_id)
    chat_id = Column(String, ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    synthesis_id = Column(String, ForeignKey("synthesis.id", ondelete="SET NULL"), index=True)
    section = Column(String, index=True)
    content = Column(Text, nullable=False)
    version = Column(Integer, default=1)
    confidence = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now)


class KnowledgeEdge(Base):
    __tablename__ = "knowledge_edges"

    id = Column(String, primary_key=True, default=gen_id)

    chat_id = Column(String, ForeignKey("chats.id", ondelete="CASCADE"), index=True)

    from_node_id = Column(String, ForeignKey("knowledge_nodes.id", ondelete="CASCADE"), index=True)
    to_node_id = Column(String, ForeignKey("knowledge_nodes.id", ondelete="CASCADE"), index=True)

    relation = Column(String, index=True)  # SUPPORTS, CONTRADICTS, REFINES, DEPENDS_ON, BLOCKS, ALTERNATIVE_OF
    created_at = Column(DateTime(timezone=True), default=now)
