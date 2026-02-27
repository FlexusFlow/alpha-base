# from langchain_community.vectorstores import DeepLake
import asyncio
import logging
import os

from langchain_deeplake import DeeplakeVectorStore
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import Settings

logger = logging.getLogger(__name__)


class VectorStoreService:
    def __init__(self, settings: Settings):
        self.embeddings = OpenAIEmbeddings(
            model=settings.embedding_model,
            openai_api_key=settings.openai_api_key,
        )
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        self.deeplake_path = settings.deeplake_path
        self._is_cloud = settings.deeplake_path.startswith("hub://")
        self._activeloop_token = settings.activeloop_token if self._is_cloud else None

    def _get_db_kwargs(self, **extra) -> dict:
        """Build common kwargs for DeeplakeVectorStore instantiation."""
        kwargs = {
            "dataset_path": self.deeplake_path,
            "embedding_function": self.embeddings,
            **extra,
        }
        if self._is_cloud:
            kwargs["runtime"] = {"tensor_db": True}
            kwargs["token"] = self._activeloop_token
        return kwargs

    def add_documents(self, texts: list[str], metadatas: list[dict]) -> None:
        """Batch add documents to DeepLake. Splits texts into chunks first."""
        all_chunks: list[str] = []
        all_metas: list[dict] = []

        for text, meta in zip(texts, metadatas):
            chunks = self.text_splitter.split_text(text)
            all_chunks.extend(chunks)
            all_metas.extend([meta] * len(chunks))

        if not all_chunks:
            return

        db = DeeplakeVectorStore(**self._get_db_kwargs(overwrite=False))
        db.add_texts(
            texts=all_chunks,
            metadatas=all_metas,
            embedding=self.embeddings,
            dataset_path=self.deeplake_path,
        )

    def delete_by_video_ids(self, video_ids: list[str]) -> int:
        """Delete all vector chunks matching the given video_ids from DeepLake."""
        if not video_ids:
            return 0

        db = DeeplakeVectorStore(**self._get_db_kwargs(overwrite=False))

        ids_str = ", ".join(f"'{vid}'" for vid in video_ids)
        query = f"SELECT ids FROM (SELECT * WHERE metadata['video_id'] IN ({ids_str}))"
        results = db.dataset.query(query)

        matching_ids = results["ids"][:]
        if len(matching_ids) == 0:
            return 0

        db.delete(ids=list(matching_ids))
        return len(matching_ids)

    def add_documentation_pages(
        self,
        pages: list[dict],
        collection_id: str,
        site_name: str,
        user_id: str,
    ) -> None:
        """Index documentation pages into DeepLake with documentation-specific metadata.

        Args:
            pages: List of dicts with keys: page_url, title, content_markdown
            collection_id: UUID of the doc_collection
            site_name: Name of the documentation site
            user_id: Owner user ID
        """
        texts = []
        metadatas = []
        for page in pages:
            if not page.get("content_markdown"):
                continue
            texts.append(page["content_markdown"])
            metadatas.append({
                "collection_id": collection_id,
                "page_url": page["page_url"],
                "page_title": page.get("title", ""),
                "site_name": site_name,
                "source_type": "documentation",
                "source": page["page_url"],
            })
        if texts:
            self.add_documents(texts, metadatas)

    def delete_by_collection_id(self, collection_id: str) -> int:
        """Delete all vector chunks matching a documentation collection_id."""
        if not collection_id:
            return 0

        db = DeeplakeVectorStore(**self._get_db_kwargs(overwrite=False))

        query = f"SELECT ids FROM (SELECT * WHERE metadata['collection_id'] == '{collection_id}')"
        results = db.dataset.query(query)

        matching_ids = results["ids"][:]
        if len(matching_ids) == 0:
            return 0

        db.delete(ids=list(matching_ids))
        return len(matching_ids)

    def _dataset_exists(self) -> bool:
        """Check if the dataset exists (local directory or cloud dataset)."""
        if self._is_cloud:
            # For cloud datasets, we attempt to open and catch errors
            return True  # Cloud datasets are created lazily; let methods handle errors
        return os.path.exists(self.deeplake_path)

    async def similarity_search(
        self, query: str, k: int = 5, score_threshold: float = 0.0, deep_memory: bool = False
    ) -> list[tuple]:
        """Search the vector store and return (doc, score) tuples.

        Args:
            query: Search query text.
            k: Maximum number of results.
            score_threshold: Minimum relevance score (0-1) to include a result.
            deep_memory: If True, use Deep Memory enhanced search (requires cloud DeepLake).

        Returns empty list if the dataset doesn't exist yet (new user).
        """
        if not self._dataset_exists():
            return []
        try:
            db = DeeplakeVectorStore(**self._get_db_kwargs(read_only=True))
            return await db.asimilarity_search_with_relevance_scores(
                query=query, k=k, score_threshold=score_threshold, deep_memory=deep_memory
            )
        except Exception as e:
            if "does not exist" in str(e).lower() or "not found" in str(e).lower():
                logger.info("Dataset not found at %s, returning empty results", self.deeplake_path)
                return []
            raise

    def get_chunk_count(self) -> int:
        """Return the number of documents in the DeepLake dataset without loading content.

        Returns 0 if the dataset doesn't exist yet (new user).
        """
        if not self._dataset_exists():
            return 0
        try:
            db = DeeplakeVectorStore(**self._get_db_kwargs(read_only=True))
            return len(db.dataset)
        except Exception as e:
            if "does not exist" in str(e).lower() or "not found" in str(e).lower():
                logger.info("Dataset not found at %s, returning count 0", self.deeplake_path)
                return 0
            raise

    def get_all_chunk_ids_and_texts(self) -> list[dict]:
        """Enumerate all documents in the DeepLake dataset.

        Returns list of dicts: [{"id": chunk_id, "text": page_content, "metadata": {...}}]
        Returns empty list if the dataset doesn't exist yet (new user).
        """
        if not self._dataset_exists():
            return []
        try:
            db = DeeplakeVectorStore(**self._get_db_kwargs(read_only=True))
            dataset = db.dataset

            ids = dataset["ids"][:]
            texts = dataset["documents"][:]
            metadatas = dataset["metadata"][:]

            return [
                {"id": str(ids[i]), "text": str(texts[i]), "metadata": metadatas[i]}
                for i in range(len(ids))
            ]
        except Exception as e:
            if "does not exist" in str(e).lower() or "not found" in str(e).lower():
                logger.info("Dataset not found at %s, returning empty list", self.deeplake_path)
                return []
            raise

    def get_deep_memory_api(self):
        """Return the deep_memory sub-API from the DeepLake vectorstore.

        Used for .train(), .status(), .evaluate() calls.
        """
        db = DeeplakeVectorStore(**self._get_db_kwargs(read_only=False))
        return db.vectorstore.deep_memory


def get_user_vectorstore(user_id: str, settings: Settings) -> VectorStoreService:
    """Create a VectorStoreService scoped to a specific user's dataset.

    Derives the per-user dataset path from the base deeplake_path:
    - Local: ./knowledge_base/user-<user_id>
    - Cloud: hub://<org>/user-<user_id>
    """
    user_path = f"{settings.deeplake_path}/user-{user_id}"
    user_settings = settings.model_copy(update={"deeplake_path": user_path})
    return VectorStoreService(user_settings)


async def cleanup_user_vectorstore(user_id: str, settings: Settings) -> None:
    """Clear all data from a user's dataset (for account deletion).

    Uses overwrite=True to preserve the dataset name on DeepLake Cloud
    (hard-deleting a cloud dataset permanently burns the name).
    """
    user_path = f"{settings.deeplake_path}/user-{user_id}"
    is_cloud = user_path.startswith("hub://")

    embeddings = OpenAIEmbeddings(
        model=settings.embedding_model,
        openai_api_key=settings.openai_api_key,
    )
    kwargs = {
        "dataset_path": user_path,
        "embedding_function": embeddings,
        "overwrite": True,
    }
    if is_cloud:
        kwargs["runtime"] = {"tensor_db": True}
        kwargs["token"] = settings.activeloop_token

    await asyncio.to_thread(DeeplakeVectorStore, **kwargs)
    logger.info("Cleared vector store for user %s at %s", user_id, user_path)
