from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

from dotenv import load_dotenv

load_dotenv()



class Settings(BaseSettings):
    openai_api_key: str            # will read from .env
    fe_host: str                   # will read from .env
    supabase_service_key: str      # will read from .env
    supabase_url: str              # will read from .env
    deeplake_path: str             # will read from .env
    activeloop_token: str          # will read from .env
    transcripts_dir: str = "./knowledge_base/transcripts"
    cors_origins: List[str] = []   # will be set from fe_host if not provided
    embedding_model: str = "text-embedding-3-small"
    chunk_size: int = 1000
    chunk_overlap: int = 200
    preview_video_limit: int = 500
    chat_model: str = "gpt-4o"
    chat_max_tokens: int = 2048
    rag_retrieval_k: int = 5
    rag_score_threshold: float = 0.3
    deep_memory_generation_model: str = "gpt-4o"
    deep_memory_target_questions_per_chunk: int = 4
    deep_memory_max_pairs: int = 5000
    deep_memory_generation_delay: float = 1.0
    doc_link_filter_model: str = "gpt-4o-mini"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # set cors_origins default to fe_host if empty
        if not self.cors_origins:
            self.cors_origins = [self.fe_host]

# load settings
settings = Settings()
