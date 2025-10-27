from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="AI Concierge")
    environment: str = Field(default="local")
    api_prefix: str = Field(default="/api")

    openai_api_key: SecretStr | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_assistant_model: str = Field(default="gpt-4.1-mini")
    openai_embedding_model: str = Field(default="text-embedding-3-small")

    db_host: str = Field(default="localhost")
    db_port: int = Field(default=5432)
    db_user: str = Field(default="postgres")
    db_password: SecretStr = Field(default=SecretStr("postgres"))
    db_name: str = Field(default="concierge")
    db_schema: str | None = Field(default="nostr")
    db_table: str = Field(default="sellers")
    listings_table: str | None = Field(
        default="classified_listings", alias="DB_LISTINGS_TABLE"
    )
    db_pool_size: int = Field(default=5)
    db_max_overflow: int = Field(default=10)

    embedding_dimensions: int = Field(default=1536)
    search_top_k: int = Field(default=5)
    listings_per_seller: int = Field(default=4)

    s3_analytics_bucket: str = Field(default="ai-concierge-analytics-dev")
    s3_region: str = Field(default="us-east-1")
    aws_access_key_id: str | None = Field(default=None, alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: SecretStr | None = Field(
        default=None, alias="AWS_SECRET_ACCESS_KEY"
    )
    aws_endpoint_url: str | None = Field(default=None, alias="AWS_ENDPOINT_URL")

    analytics_flush_interval_seconds: int = Field(default=60)
    frontend_base_url: str = Field(default="http://localhost:5173")

    # Nostr relay configuration for NIP-89 handler discovery
    nostr_relays: list[str] = Field(
        default=["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"],
        description="Comma-separated or list of Nostr relay URLs for NIP-89 discovery",
    )
    nip89_cache_ttl: int = Field(
        default=300, description="NIP-89 handler discovery cache TTL in seconds"
    )
    nostr_connection_timeout: int = Field(
        default=5, description="WebSocket connection timeout in seconds"
    )
    nostr_query_timeout: int = Field(
        default=3, description="Relay query timeout in seconds"
    )

    @field_validator("nostr_relays", mode="after")
    @classmethod
    def parse_nostr_relays(cls, v: str | list[str]) -> list[str]:
        """Parse comma-separated string or list of relay URLs.

        Using mode='after' to run after pydantic's type coercion,
        so we handle the string before pydantic tries to JSON-decode it.
        """
        if v is None or v == "":
            # Return default relays if not set
            return [
                "wss://relay.damus.io",
                "wss://nos.lol",
                "wss://relay.nostr.band",
            ]
        if isinstance(v, str):
            relays = [url.strip() for url in v.split(",") if url.strip()]
            # If string was empty or only whitespace, return defaults
            return (
                relays
                if relays
                else [
                    "wss://relay.damus.io",
                    "wss://nos.lol",
                    "wss://relay.nostr.band",
                ]
            )
        # Already a list
        return v

    @property
    def async_db_url(self) -> str:
        password = self.db_password.get_secret_value()  # pylint: disable=no-member
        return (
            f"postgresql+asyncpg://{self.db_user}:{password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def sync_db_url(self) -> str:
        password = self.db_password.get_secret_value()  # pylint: disable=no-member
        return (
            f"postgresql+psycopg://{self.db_user}:{password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]
