import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import boto3
import structlog
from botocore.exceptions import ClientError, EndpointConnectionError, NoCredentialsError

from ..core.config import get_settings


settings = get_settings()
logger = structlog.get_logger(__name__)


class AnalyticsService:
    """Accumulates session analytics in memory and persists to S3."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker_task: asyncio.Task[None] | None = None
        self._session_data: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self._enabled = True

        session = boto3.session.Session()
        self._s3_client = session.client(
            "s3",
            region_name=settings.s3_region,
            endpoint_url=settings.aws_endpoint_url,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=(
                settings.aws_secret_access_key.get_secret_value() if settings.aws_secret_access_key else None
            ),
        )
        try:
            self._ensure_bucket()
        except NoCredentialsError:
            logger.warning(
                "analytics_s3_disabled_no_credentials",
                bucket=settings.s3_analytics_bucket,
            )
            self._enabled = False
        except EndpointConnectionError as exc:
            logger.warning(
                "analytics_s3_disabled_unreachable",
                bucket=settings.s3_analytics_bucket,
                endpoint=settings.aws_endpoint_url or "aws",
                error=str(exc),
            )
            self._enabled = False

    async def start(self) -> None:
        if self._worker_task is None:
            self._worker_task = asyncio.create_task(self._worker())

    async def stop(self) -> None:
        if self._worker_task is not None:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None

    async def record_query(self, visitor_id: str, session_id: str, query: str) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        date_key = now.strftime("%Y-%m-%d")

        async with self._lock:
            session_payload = self._session_data.setdefault(
                session_id,
                {
                    "session_id": session_id,
                    "visitor_id": visitor_id,
                    "date": date_key,
                    "created_at": now.isoformat(),
                    "queries": [],
                },
            )
            session_payload["visitor_id"] = visitor_id
            session_payload["date"] = date_key
            session_payload["updated_at"] = now.isoformat()
            session_payload.setdefault("queries", []).append(
                {"timestamp": now.isoformat(), "query": query}
            )
            session_payload["query_count"] = len(session_payload["queries"])

        await self._queue.put(session_id)
        return {
            "timestamp": now.isoformat(),
            "date": date_key,
            "visitor_id": visitor_id,
            "session_id": session_id,
            "query": query,
        }

    async def _worker(self) -> None:
        while True:
            session_id = await self._queue.get()
            try:
                await self._flush_session(session_id)
            finally:
                self._queue.task_done()

    async def _flush_session(self, session_id: str) -> None:
        async with self._lock:
            payload = self._session_data.get(session_id)
            if not payload:
                return
            payload_to_write = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            key = f"analytics/daily/{payload['date']}/{session_id}.json"

        if not self._enabled:
            return

        def _put_object() -> None:
            self._s3_client.put_object(
                Bucket=settings.s3_analytics_bucket,
                Key=key,
                Body=payload_to_write,
                ContentType="application/json",
            )

        try:
            await asyncio.to_thread(_put_object)
        except Exception as exc:  # noqa: BLE001
            logger.warning("analytics_upload_failed", error=str(exc), key=key)

    def _ensure_bucket(self) -> None:
        bucket = settings.s3_analytics_bucket
        if not self._enabled:
            return

        try:
            self._s3_client.head_bucket(Bucket=bucket)
        except NoCredentialsError:
            raise
        except EndpointConnectionError as exc:
            logger.warning(
                "analytics_bucket_unreachable",
                bucket=bucket,
                endpoint=settings.aws_endpoint_url or "aws",
                error=str(exc),
            )
            self._enabled = False
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchBucket", "NoSuchBucketPolicy"):
                create_kwargs: dict[str, Any] = {"Bucket": bucket}
                if not settings.aws_endpoint_url and settings.s3_region != "us-east-1":
                    create_kwargs["CreateBucketConfiguration"] = {
                        "LocationConstraint": settings.s3_region
                    }
                self._s3_client.create_bucket(**create_kwargs)
                logger.info("analytics_bucket_created", bucket=bucket)
            else:
                raise


analytics_service = AnalyticsService()
