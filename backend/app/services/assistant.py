import asyncio
from typing import List

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_random_exponential

from ..core.config import get_settings
from ..schemas import ChatMessage, SellerResult


settings = get_settings()
client = OpenAI(api_key=settings.openai_api_key.get_secret_value() if settings.openai_api_key else None)


class AssistantError(RuntimeError):
    pass


def _build_context(results: List[SellerResult]) -> str:
    lines = []
    for idx, result in enumerate(results, start=1):
        meta = result.meta_data or {}
        location = meta.get("city")
        tags = ", ".join(meta.get("hashtags", [])) if meta.get("hashtags") else ""
        listing_lines = []
        for listing in result.listings[:3]:
            price_parts = []
            if listing.price:
                if listing.price.amount is not None:
                    price_parts.append(f"{listing.price.amount:g}")
                if listing.price.currency:
                    price_parts.append(listing.price.currency)
                if listing.price.frequency:
                    price_parts.append(listing.price.frequency)
            price_str = f" ({' '.join(price_parts)})" if price_parts else ""
            detail = listing.summary or listing.content or ""
            detail_str = f" – {detail}" if detail else ""
            listing_lines.append(f"     - {listing.title}{price_str}{detail_str}")
        listings_block = ""
        if listing_lines:
            listings_block = "\n   Products & Services:\n" + "\n".join(listing_lines)
        lines.append(
            f"{idx}. {result.name or 'Unknown'} (score: {result.score:.3f})\n"
            f"   Summary: {result.content or 'No description provided.'}\n"
            f"   Location: {location or 'Unknown'}\n"
            f"   Tags: {tags}"
            f"{listings_block}"
        )
    return "\n".join(lines)


@retry(wait=wait_random_exponential(multiplier=1, max=20), stop=stop_after_attempt(3))
async def generate_response(
    query: str,
    results: List[SellerResult],
    history: List[ChatMessage],
) -> str:
    """Call OpenAI to craft a concierge-style response."""

    def _call() -> str:
        if settings.openai_api_key is None:
            raise AssistantError("OPENAI_API_KEY is not configured")

        system_prompt = (
            "You are a friendly AI concierge helping people discover local businesses. "
            "Use ONLY the facts present in the provided business context—do not infer or "
            "embellish missing details. If information is absent, state that you do not "
            "know. Respond concisely with at most three recommendations, include the city "
            "and a verbatim highlight drawn from the context, and suggest a follow-up only "
            "when it clearly adds value."
        )
        messages = [
            {"role": "system", "content": system_prompt},
        ]

        for msg in history[-6:]:
            messages.append({"role": msg.role, "content": msg.content})

        context_block = _build_context(results) if results else "No relevant businesses found."
        user_prompt = (
            f"User question: {query}\n\n"
            f"Business context:\n{context_block}"
        )
        messages.append({"role": "user", "content": user_prompt})

        response = client.chat.completions.create(
            model=settings.openai_assistant_model,
            temperature=0.4,
            messages=messages,
        )
        choice = response.choices[0].message
        return choice.content or "I couldn't find anything right now, please try again."

    return await asyncio.to_thread(_call)
