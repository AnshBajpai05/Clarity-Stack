from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, Field
from datetime import datetime

from database import get_db
from models import Project

from providers import ask_groq, ask_gemini, ask_hf
from uuid import uuid4
from signal_classify import classify_signal
from synthesis_service import generate_and_store_synthesis




app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # OR ["*"] if you prefer
    allow_credentials=True,
    allow_methods=["*"],            # <-- IMPORTANT
    allow_headers=["*"],            # <-- IMPORTANT
)

# ---------- Health ----------
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    return {"status": "ok"}


from typing import Optional, List, Dict

# ---------- Pydantic Schemas ----------

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    purpose: str = Field(..., min_length=10)
    success_criteria: str = Field(..., min_length=10)
    constraints: str = Field(..., min_length=5)
    owner: Optional[str] = None


class ProjectOut(BaseModel):
    id: str
    name: str
    purpose: str
    success_criteria: str
    constraints: str
    owner: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = dict(from_attributes=True)


# ---------- Endpoints ----------

@app.post("/projects", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):

    project = Project(
        name = payload.name.strip(),
        purpose = payload.purpose.strip(),
        success_criteria = payload.success_criteria.strip(),
        constraints = payload.constraints.strip(),
        owner = payload.owner.strip() if payload.owner else None
    )

    db.add(project)
    db.commit()
    db.refresh(project)

    return project


@app.get("/projects", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    projects = (
        db.query(Project)
        .order_by(Project.created_at.desc())
        .all()
    )
    return projects

@app.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from fastapi import Path
from models import Project, Chat


class ChatCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    source_type: Optional[str] = Field(
        None,
        description="Where chat came from e.g. chatgpt/slack/manual"
    )

    # 🆕 CHAT CONTEXT FIELDS
    purpose: Optional[str] = "Chat purpose not yet defined."
    phase: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None


class ChatOut(BaseModel):
    id: str
    project_id: str
    title: Optional[str]
    source_type: Optional[str]
    external_chat_id: Optional[str]
    pinned: bool
    archived: bool

    # 🆕 CHAT CONTEXT
    purpose: str
    phase: Optional[str]
    description: Optional[str]
    owner: Optional[str]

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


from fastapi import HTTPException


@app.post("/projects/{project_id}/chats", response_model=ChatOut)
def create_chat(
    project_id: str = Path(...),
    payload: ChatCreate = None,
    db: Session = Depends(get_db)
):
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chat = Chat(
        project_id=project_id,
        title=(payload.title.strip() if payload.title else None),
        source_type=payload.source_type,

        # 🆕 CONTEXT FIELDS
        purpose=payload.purpose or "Chat purpose not yet defined.",
        phase=payload.phase,
        description=payload.description,
        owner=payload.owner,
    )


    db.add(chat)
    db.commit()
    db.refresh(chat)

    return chat



from fastapi import Query

@app.get("/projects/{project_id}/chats", response_model=List[ChatOut])
def list_chats(
    project_id: str,
    archived: bool = Query(False),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chats = (
        db.query(Chat)
        .filter(Chat.project_id == project_id)
        .filter(Chat.archived == archived)
        .order_by(Chat.pinned.desc(), Chat.created_at.desc())
        .all()
    )

    return chats


from typing import List
from models import Message, Chat

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime


class MessageCreate(BaseModel):
    role: Optional[str] = Field(None, description="user/assistant/system/tool/etc")
    sender: Optional[str] = Field(None, max_length=255)
    text: str = Field(...)

    type: Optional[str] = None
    include_in_summary: bool = True
    topic: Optional[str] = None
    has_attachments: bool = False
    attachments_json: Optional[str] = None
    
    

    created_at: datetime   # original timestamp

    
    @field_validator("text")
    @classmethod
    def no_blank_messages(cls, v):
        if not v or not v.strip():
            raise ValueError("Message text cannot be empty")
        return v.strip()

    @field_validator("sender")
    @classmethod
    def validate_sender(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Sender name cannot be blank")
        return v.strip() if v else v


class MessageOut(BaseModel):
    id: str
    chat_id: str
    role: Optional[str]
    sender: Optional[str]
    type: Optional[str]

    text: str

    include_in_summary: bool
    has_attachments: bool
    attachments_json: Optional[str]
    topic: Optional[str]

    source_message_id: Optional[str]
    accepted: bool

    created_at: datetime
    ingested_at: datetime
    reply_group_id: Optional[str] = None

    signal_level: Optional[str] = None   # 👈 ADD THIS

    model_config = dict(from_attributes=True)


import json
from sqlalchemy.exc import SQLAlchemyError
from models import QuarantinedMessage

@app.post("/chats/{chat_id}/messages", response_model=MessageOut)
def create_message(chat_id: str, payload: MessageCreate, db: Session = Depends(get_db)):

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    try:
        message = Message(
            chat_id=chat_id,
            role=payload.role,
            sender=payload.sender,
            text=payload.text,
            type=payload.type,
            include_in_summary=payload.include_in_summary,
            topic=payload.topic,
            has_attachments=payload.has_attachments,
            attachments_json=payload.attachments_json,
            created_at=payload.created_at
        )

        db.add(message)
        db.commit()
        db.refresh(message)
        return message

    except Exception as e:
        # store quarantine record
        qm = QuarantinedMessage(
            chat_id=chat_id,
            raw_payload=json.dumps(payload.model_dump(), default=str),
            error_reason=str(e)
        )
        db.add(qm)
        db.commit()

        raise HTTPException(status_code=400, detail="Message rejected & quarantined for review")



@app.get("/chats/{chat_id}/messages", response_model=List[MessageOut])
def list_messages(
    chat_id: str,
    db: Session = Depends(get_db)
):

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc())   # NEW — latest first
        .all()
    )

    return messages

class SummaryToggle(BaseModel):
    include: bool

@app.patch("/messages/{message_id}/include", response_model=MessageOut)
def toggle_message_in_summary(
    message_id: str,
    payload: SummaryToggle,
    db: Session = Depends(get_db)
):

    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    message.include_in_summary = payload.include
    db.commit()
    db.refresh(message)

    return message


class MessageTypeUpdate(BaseModel):
    type: str

@app.patch("/messages/{message_id}/type", response_model=MessageOut)
def update_message_type(
    message_id: str,
    payload: MessageTypeUpdate,
    db: Session = Depends(get_db)
):

    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    message.type = payload.type
    db.commit()
    db.refresh(message)

    return message

from fastapi import HTTPException

@app.delete("/chats/{chat_id}")
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()

    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    db.delete(chat)   # Messages are deleted via ON DELETE CASCADE
    db.commit()

    return {"status": "deleted", "chat_id": chat_id}

import time
import logging
from fastapi import Request

# --- Basic logger setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()

    try:
        response = await call_next(request)
    except Exception as e:
        logging.exception(f"❌ ERROR handling request {request.method} {request.url}")
        raise e

    process_time = (start_time - time.time()) * -1000

    logging.info(
        f"➡ {request.method} {request.url.path} "
        f"→ {response.status_code} "
        f"({process_time:.2f} ms)"
    )

    return response


from pydantic import BaseModel, Field

# class ChatRename(BaseModel):
#     title: str = Field(..., min_length=1, max_length=255)


# @app.patch("/chats/{chat_id}", response_model=ChatOut)
# def rename_chat(
#     chat_id: str,
#     payload: ChatRename,
#     db: Session = Depends(get_db)
# ):
#     chat = db.query(Chat).filter(Chat.id == chat_id).first()

#     if not chat:
#         raise HTTPException(status_code=404, detail="Chat not found")

#     new_title = payload.title.strip()
#     if not new_title:
#         raise HTTPException(status_code=400, detail="Title cannot be empty")

#     chat.title = new_title
#     db.commit()
#     db.refresh(chat)

#     return chat

from pydantic import BaseModel

class PinUpdate(BaseModel):
    pinned: bool

@app.patch("/chats/{chat_id}/pin")
def update_pin_state(chat_id: str, payload: PinUpdate, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()

    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    chat.pinned = payload.pinned
    db.commit()
    db.refresh(chat)

    return {"status": "ok", "pinned": chat.pinned}

class ArchiveUpdate(BaseModel):
    archived: bool

@app.patch("/chats/{chat_id}/archive")
def archive_chat(chat_id: str, payload: ArchiveUpdate, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    chat.archived = payload.archived
    db.commit()
    db.refresh(chat)
    return {"status": "ok", "archived": chat.archived}

@app.get("/projects/{project_id}/chats/archived", response_model=List[ChatOut])
def list_archived_chats(project_id: str, db: Session = Depends(get_db)):
    return (
        db.query(Chat)
        .filter(Chat.project_id == project_id, Chat.archived == True)
        .order_by(Chat.created_at.desc())
        .all()
    )

def safe(fn, prompt):
    try:
        return fn(prompt)
    except Exception as e:
        return f"⚠️ Error calling model: {e}"

from uuid import uuid4
from fastapi import HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pydantic import BaseModel
from uuid import uuid4
import json
from fastapi import Depends
from sqlalchemy.orm import Session



class AskPayload(BaseModel):
    sender: str
    text: str
    
def tag_with_provider(provider: str, block: str) -> str:
    return block.replace("- SOURCE::", f"- {provider.upper()}::")


@app.post("/chats/{chat_id}/ask")
def ask_multi_model(chat_id: str, payload: AskPayload, db: Session = Depends(get_db)):

    # 1. Classify signal
    signal = classify_signal(payload.text)
    include = signal in ("high", "medium")

    user = Message(
        chat_id=chat_id,
        role="user",
        sender=payload.sender,
        text=payload.text,
        include_in_summary=include,
        has_attachments=False,
        accepted=False,
        signal_level=signal,
        type=None
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # 2. Noise filter
    if signal == "noise":
        default_reply = Message(
            chat_id=chat_id,
            role="assistant",
            sender="clarity-stack",
            text=(
                "This message looks like it contains very little actionable project "
                "context — so it wasn't added to your working summary.\n\n"
                "If this was important, please resend it with more details 🙂"
            ),
            include_in_summary=False,
            accepted=False,
            signal_level=None
        )
        db.add(default_reply)
        db.commit()
        return {"status": "noise_filtered"}

    # 3. Multi-model tagged extraction
    group = str(uuid4())

    # --- 🆕 CONTEXT INJECTION START ---
    from context_builder import build_chat_context
    history_block = build_chat_context(db, chat_id, limit=10)
    
    # Prepend history to the current user prompt
    prompt = f"{history_block}\n\n=== CURRENT USER REQUEST ===\n{payload.text}"
    # --- CONTEXT INJECTION END ---

    providers = [
        ("groq", ask_groq),
        ("gemini", ask_gemini),        # mocked
        ("huggingface", ask_hf),
    ]

    ai_msgs = []
    extracted_blocks = []

    for name, fn in providers:
        try:
            raw_block = fn(prompt)   # returns SOURCE:: tagged text
            if not raw_block or not raw_block.strip():
                raise ValueError("Empty model output")

        except Exception as e:
            raw_block = f"""FACT:
- SOURCE:: {name.upper()} hard failure: {str(e)}

CONSTRAINT:
ASSUMPTION:
OPTION:
DECISION:
CONFLICT:
EXAMPLE:
UNKNOWN:
CONFIDENCE:
"""

        # 👇 Only synthesis sees provider names
        tagged_block = tag_with_provider(name, raw_block)

        # 👇 UI stores clean SOURCE:: version
        m = Message(
            chat_id=chat_id,
            role="assistant",
            sender=name,
            text=raw_block,
            reply_group_id=group,
            include_in_summary=False,  # never in summary
            accepted=False,            # can be accepted
            signal_level=None
        )


        db.add(m)
        ai_msgs.append(m)
        extracted_blocks.append(tagged_block)

    db.commit()
    for m in ai_msgs:
        db.refresh(m)

    # 4. Deterministic synthesis (compiler-grade merge)
    try:
        synth = generate_and_store_synthesis(
            db=db,
            chat_id=chat_id,
            reply_group_id=group,
            assistant_replies=extracted_blocks
        )
    except RuntimeError as e:
        return {
            "status": "synthesis_validation_failed",
            "reply_group_id": group,
            "error": str(e)
        }


    synth_msg = Message(
        chat_id=chat_id,
        role="synthesis",
        sender="synthesis",
        type="synthesis",
        text=synth.content,
        reply_group_id=group,
        synthesis_id=synth.id,        # 🔥 THIS IS THE MISSING WIRE
        include_in_summary=True,
        accepted=True,
        signal_level="high"
    )



    db.add(synth_msg)
    db.commit()
    db.refresh(synth_msg)

    print("SYNTHESIS SAVED TO DB:", synth_msg.id)

    return {
        "status": "ok",
        "reply_group_id": group,
        "synthesis_id": synth.id
    }

class AcceptUpdate(BaseModel):
    accepted: bool


@app.post("/messages/{message_id}/accept")
def accept_message(
    message_id: str,
    payload: AcceptUpdate,
    db: Session = Depends(get_db)
):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    if msg.role != "assistant":
        raise HTTPException(status_code=400, detail="Only assistant messages can be accepted")

    if payload.accepted is False:
        msg.accepted = False
        db.commit()
        return {"ok": True}

    if msg.reply_group_id:
        db.query(Message).filter(
            Message.reply_group_id == msg.reply_group_id,
            Message.role == "assistant",
            Message.id != msg.id
        ).update({Message.accepted: False}, synchronize_session=False)

    msg.accepted = True
    db.commit()

    return {"ok": True}
import re
from difflib import SequenceMatcher

TECH_KEYWORDS = [
    "deploy","database","db","pipeline","model","training","frontend",
    "backend","api","server","auth","docker","kubernetes","config",
    "query","optimize","latency","testing","bug","issue","crash"
]

STOPWORDS = set([
    "the","a","an","to","and","or","of","in","for","non",
    "on","at","is","are","am","be","was","were",
    "it","this","that","i","you"
])


def normalize(text: str):
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def fuzzy_ratio(a, b):
    return SequenceMatcher(None, a, b).ratio()


def is_similar(word, keyword, threshold=0.80):
    return fuzzy_ratio(word, keyword) >= threshold


def count_signal_words(text: str):
    tokens = [t for t in normalize(text).split() if t not in STOPWORDS]
    score = 0

    for t in tokens:

        # match tech keywords fuzzily
        for kw in TECH_KEYWORDS:
            if is_similar(t, kw):
                score += 2
                break

        # informative long word bonus
        if len(t) >= 7:
            score += 1

    return score


def classify_signal(text: str):
    score = count_signal_words(text)

    if score >= 6:
        return "high"
    if score >= 3:
        return "medium"
    if score >= 1:
        return "low"

    return "noise"

@app.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str,
    payload: dict,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    allowed = {"purpose", "success_criteria", "constraints", "owner"}

    for key, value in payload.items():
        if key in allowed:
            setattr(project, key, value)

    db.commit()
    db.refresh(project)

    return project

from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session

# make sure ChatOut + Chat + get_db are already imported

@app.get("/chats/{chat_id}", response_model=ChatOut)
def get_chat(chat_id: str, db: Session = Depends(get_db)):
    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id)
        .first()
    )

    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    return chat

from typing import Optional
from pydantic import BaseModel

class ChatUpdate(BaseModel):
    title: Optional[str] = None
    purpose: Optional[str] = None
    phase: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None

    class Config:
        extra = "ignore"   # ignore unknown fields

from typing import List
from fastapi import Depends
from sqlalchemy.orm import Session



@app.patch("/chats/{chat_id}", response_model=ChatOut)
def update_chat(chat_id: str, payload: ChatUpdate, db: Session = Depends(get_db)):

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    updates = payload.model_dump(exclude_unset=True)

    for key, value in updates.items():
        setattr(chat, key, value)

    db.commit()
    db.refresh(chat)
    return chat

from typing import List
from fastapi import Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Message
from schemas import MessageSchema   # <-- your existing Pydantic schema


@app.get("/chats/{chat_id}/accepted", response_model=List[MessageSchema])
async def get_accepted_messages(chat_id: str, db: Session = Depends(get_db)):

    return (
        db.query(Message)
        .filter(
            Message.chat_id == chat_id,
            Message.role == "assistant",
            Message.accepted.is_(True),
        )
        .order_by(Message.created_at.asc())
        .all()
    )


@app.get("/chats/{chat_id}/user", response_model=List[MessageSchema])
async def get_user_messages(chat_id: str, db: Session = Depends(get_db)):
    return (
        db.query(Message)
        .filter(Message.chat_id == chat_id, Message.role == "user")
        .order_by(Message.created_at.asc())
        .all()
    )


# =========================
# SYNTHESIS ROUTES
# =========================

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from synthesis_service import (
    save_or_update_synthesis,
    get_synthesis,
    list_synthesis_for_chat
)

from pydantic import BaseModel


class SynthesisCreatePayload(BaseModel):
    reply_group_id: str
    content: str
    model_used: str | None = None


class SynthesisResponse(BaseModel):
    id: str
    chat_id: str
    reply_group_id: str
    content: str
    model_used: str | None

    class Config:
        from_attributes = True


@app.post("/chats/{chat_id}/synthesis", response_model=SynthesisResponse)
def create_or_update_synthesis(
    chat_id: str,
    payload: SynthesisCreatePayload,
    db: Session = Depends(get_db)
):
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Synthesis content cannot be empty")

    synthesis = save_or_update_synthesis(
        db=db,
        chat_id=chat_id,
        reply_group_id=payload.reply_group_id,
        content=payload.content,
        model_used=payload.model_used,
    )

    return synthesis

from prompts.synthesis_prompt import SYNTHESIS_SYSTEM_PROMPT, SYNTHESIS_USER_PROMPT_TEMPLATE


@app.get("/chats/{chat_id}/synthesis", response_model=list[SynthesisResponse])
def list_chat_synthesis(
    chat_id: str,
    db: Session = Depends(get_db)
):
    return list_synthesis_for_chat(db, chat_id)


@app.get("/chats/{chat_id}/synthesis/{reply_group_id}", response_model=SynthesisResponse)
def get_chat_synthesis(
    chat_id: str,
    reply_group_id: str,
    db: Session = Depends(get_db)
):
    synthesis = get_synthesis(db, chat_id, reply_group_id)
    if not synthesis:
        raise HTTPException(status_code=404, detail="Synthesis not found")

    return synthesis


class ReplyGroupInput(BaseModel):
    reply_group_id: str


from models import Message

def get_assistant_replies(db: Session, reply_group_id: str):
    return (
        db.query(Message)
        .filter(
            Message.reply_group_id == reply_group_id,
            Message.role == "assistant",
            Message.sender != "synthesis"
        )
        .order_by(Message.created_at.asc())
        .all()
    )

from synthesis_service import generate_and_store_synthesis



@app.post("/chats/{chat_id}/synthesis/generate", response_model=SynthesisResponse)
def generate_synthesis(
    chat_id: str,
    payload: ReplyGroupInput,
    db: Session = Depends(get_db)
):
    replies = get_assistant_replies(db, payload.reply_group_id)

    if not replies:
        raise HTTPException(status_code=404, detail="No assistant replies for this group")

    synthesis = generate_and_store_synthesis(
        db=db,
        chat_id=chat_id,
        reply_group_id=payload.reply_group_id,
        assistant_replies=[r.text for r in replies],
    )

    if not synthesis.content.strip():
        raise HTTPException(status_code=500, detail="Synthesis generation failed")


    # 👇 Make it visible in chat UI
    synth_msg = Message(
        chat_id=chat_id,
        role="assistant",
        sender="synthesis",
        text=synthesis.content,
        reply_group_id=payload.reply_group_id,
        include_in_summary=True,
        accepted=False,
        signal_level=None
    )


    db.add(synth_msg)
    db.commit()
    db.refresh(synth_msg)

    return synthesis


from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from reasoning_queries import get_decision_explanation
from reasoning_queries import get_decision_explanation

@app.get("/api/reasoning/chat/{chat_id}")
def get_reasoning(chat_id: str, db: Session = Depends(get_db)):
    data = get_decision_explanation(db, chat_id)

    return {
        "decision": data["decision"],
        "supports": data["supports"],
        "conflicts": data["conflicts"],
        "blockers": data["blockers"],
        "alternatives": data["alternatives"],
    }
