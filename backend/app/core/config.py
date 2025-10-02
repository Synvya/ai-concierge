from functools import lru_cache
from typing import Optional

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = Field(default="AI Concierge")
    environment: str = Field(default="local")
    api_prefix: str = Field(default="/api")

    openai_api_key: Optional[SecretStr] = Field(default=None, alias="OPENAI_API_KEY")
    openai_assistant_model: str = Field(default="gpt-4.1-mini")
    openai_embedding_model: str = Field(default="text-embedding-3-small")

    db_host: str = Field(default="localhost")
    db_port: int = Field(default=5432)
    db_user: str = Field(default="postgres")
    db_password: SecretStr = Field(default=SecretStr("postgres"))
    db_name: str = Field(default="concierge")
    db_schema: Optional[str] = Field(default="nostr")
    db_table: str = Field(default="sellers")
    db_pool_size: int = Field(default=5)
    db_max_overflow: int = Field(default=10)

    embedding_dimensions: int = Field(default=1536)
    search_top_k: int = Field(default=5)

    s3_analytics_bucket: str = Field(default="ai-concierge-analytics-dev")
    s3_region: str = Field(default="us-east-1")
    aws_access_key_id: Optional[str] = Field(default=None, alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: Optional[SecretStr] = Field(
        default=None, alias="AWS_SECRET_ACCESS_KEY"
    )
    aws_endpoint_url: Optional[str] = Field(default=None, alias="AWS_ENDPOINT_URL")

    analytics_flush_interval_seconds: int = Field(default=60)
    frontend_base_url: str = Field(default="http://localhost:5173")

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
