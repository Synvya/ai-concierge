import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import boto3
import structlog

from ..core.config import get_settings


settings = get_settings()
logger = structlog.get_logger(__name__)


class AnalyticsService:
    """Persists per-query analytics snapshots directly to S3."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task[None]] = None
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

    async def record_query(self, visitor_id: str, session_id: str, query: str) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        date_key = now.strftime("%Y-%m-%d")

        payload = {
            "timestamp": now.isoformat(),
            "date": date_key,
            "visitor_id": visitor_id,
            "session_id": session_id,
            "query": query,
        }

        await self._queue.put(payload)
        return payload

    async def _worker(self) -> None:
        while True:
            payload = await self._queue.get()
            await self._flush_to_s3(payload)
            self._queue.task_done()

    async def _flush_to_s3(self, payload: Dict[str, Any]) -> None:
        key = f"analytics/daily/{payload['date']}/{payload['session_id']}-{int(datetime.now(timezone.utc).timestamp()*1000)}.json"

        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        def _put_object() -> None:
            self._s3_client.put_object(
                Bucket=settings.s3_analytics_bucket,
                Key=key,
                Body=body,
                ContentType="application/json",
            )

        try:
            await asyncio.to_thread(_put_object)
        except Exception as exc:  # noqa: BLE001
            logger.warning("analytics_upload_failed", error=str(exc), key=key)


analytics_service = AnalyticsService()
