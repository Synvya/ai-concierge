import asyncio

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_random_exponential

from ..core.config import get_settings

settings = get_settings()
client = OpenAI(api_key=settings.openai_api_key.get_secret_value() if settings.openai_api_key else None)


class EmbeddingError(RuntimeError):
    pass


@retry(wait=wait_random_exponential(multiplier=1, max=20), stop=stop_after_attempt(3))
async def embed_text(text: str) -> list[float]:
    """Generate an embedding for the supplied text using OpenAI."""

    def _embed() -> list[float]:
        if settings.openai_api_key is None:
            raise EmbeddingError("OPENAI_API_KEY is not configured")
        response = client.embeddings.create(
            model=settings.openai_embedding_model,
            input=text,
        )
        return list(response.data[0].embedding)

    return await asyncio.to_thread(_embed)
