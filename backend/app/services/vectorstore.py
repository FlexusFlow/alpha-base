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

    def similarity_search(self, query: str, k: int = 5) -> list:
        """Search the vector store for documents similar to the query."""
        db = DeeplakeVectorStore(
            dataset_path=self.deeplake_path,
            embedding_function=self.embeddings,
            read_only=True,
        )
        return db.similarity_search(query=query, k=k)
