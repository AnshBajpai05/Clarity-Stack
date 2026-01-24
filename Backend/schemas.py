from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class MessageSchema(BaseModel):
    id: str
    chat_id: str
    role: Optional[str]
    sender: Optional[str]
    text: str
    type: Optional[str]
    topic: Optional[str]
    signal_level: Optional[str]
    include_in_summary: bool
    accepted: bool
    has_attachments: Optional[bool]
    attachments_json: Optional[str]
    source_message_id: Optional[str]
    created_at: datetime
    ingested_at: datetime
    reply_group_id: Optional[str]

    class Config:
        orm_mode = True   # <<< IMPORTANT
