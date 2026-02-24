# from langchain_community.vectorstores import DeepLake
from langchain_deeplake import DeeplakeVectorStore
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import Settings


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

    async def similarity_search(
        self, query: str, k: int = 5, score_threshold: float = 0.0, deep_memory: bool = False
    ) -> list[tuple]:
        """Search the vector store and return (doc, score) tuples.

        Args:
            query: Search query text.
            k: Maximum number of results.
            score_threshold: Minimum relevance score (0-1) to include a result.
            deep_memory: If True, use Deep Memory enhanced search (requires cloud DeepLake).
        """
        db = DeeplakeVectorStore(**self._get_db_kwargs(read_only=True))
        return await db.asimilarity_search_with_relevance_scores(
            query=query, k=k, score_threshold=score_threshold, deep_memory=deep_memory
        )

    def get_all_chunk_ids_and_texts(self) -> list[dict]:
        """Enumerate all documents in the DeepLake dataset.

        Returns list of dicts: [{"id": chunk_id, "text": page_content, "metadata": {...}}]
        """
        db = DeeplakeVectorStore(**self._get_db_kwargs(read_only=True))
        dataset = db.dataset

        ids = dataset["ids"][:]
        texts = dataset["documents"][:]
        metadatas = dataset["metadata"][:]

        return [
            {"id": str(ids[i]), "text": str(texts[i]), "metadata": metadatas[i]}
            for i in range(len(ids))
        ]

    def get_deep_memory_api(self):
        """Return the deep_memory sub-API from the DeepLake vectorstore.

        Used for .train(), .status(), .evaluate() calls.
        """
        db = DeeplakeVectorStore(**self._get_db_kwargs(read_only=False))
        return db.vectorstore.deep_memory
