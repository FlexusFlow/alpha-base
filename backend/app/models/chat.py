from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    project_id: str
    message: str
    history: list[ChatMessage] = []
    user_id: str | None = None
