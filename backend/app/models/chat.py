from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    chat_id: str
    message: str
    history: list[ChatMessage] = []
    extended_search: bool = False
