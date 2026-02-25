from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.routers import api_keys, articles, chat, deep_memory, events, knowledge, public_query, youtube


def create_app() -> FastAPI:
    settings = Settings()
    app = FastAPI(title="AlphaBase Knowledge Base", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_keys.router)
    app.include_router(articles.router)
    app.include_router(chat.router)
    app.include_router(deep_memory.router)
    app.include_router(knowledge.router)
    app.include_router(public_query.router)
    app.include_router(youtube.router)
    app.include_router(events.router)

    @app.get("/health")
    async def health_check():
        return {"status": "ok"}

    return app


app = create_app()
