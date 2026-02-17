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

        db = DeeplakeVectorStore(dataset_path=self.deeplake_path, embedding_function=self.embeddings, overwrite=False)
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

        db = DeeplakeVectorStore(
            dataset_path=self.deeplake_path,
            embedding_function=self.embeddings,
            overwrite=False,
        )

        ids_str = ", ".join(f"'{vid}'" for vid in video_ids)
        query = f"SELECT ids FROM (SELECT * WHERE metadata['video_id'] IN ({ids_str}))"
        results = db.dataset.query(query)

        matching_ids = results["ids"][:]
        if len(matching_ids) == 0:
            return 0

        db.delete(ids=list(matching_ids))
        return len(matching_ids)

    async def similarity_search(
        self, query: str, k: int = 5, score_threshold: float = 0.0
    ) -> list[tuple]:
        """Search the vector store and return (doc, score) tuples.

        Args:
            query: Search query text.
            k: Maximum number of results.
            score_threshold: Minimum relevance score (0-1) to include a result.
        """
        db = DeeplakeVectorStore(
            dataset_path=self.deeplake_path,
            embedding_function=self.embeddings,
            read_only=True,
        )
        return await db.asimilarity_search_with_relevance_scores(
            query=query, k=k, score_threshold=score_threshold
        )
