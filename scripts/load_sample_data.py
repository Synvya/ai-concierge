#!/usr/bin/env python3
"""Seed the local PostgreSQL database with the provided sample TSV export."""

from __future__ import annotations

import csv
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from psycopg import sql
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV = ROOT / "backend" / ".env.example"
SAMPLE_FILE = ROOT / "internal" / "sample_database.txt"

load_dotenv(DEFAULT_ENV)
load_dotenv(ROOT / ".env", override=True)


def get_env(key: str, default: str | None = None) -> str:
    value = os.getenv(key)
    if value:
        return value
    if default is not None:
        return default
    raise RuntimeError(f"Missing environment variable: {key}")


def bootstrap_schema(cur) -> tuple[str, str]:  # type: ignore[no-untyped-def]
    db_schema = get_env("DB_SCHEMA", "public")
    db_table = get_env("DB_TABLE", "sellers")

    cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
    cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}" ).format(sql.Identifier(db_schema)))

    cur.execute(
        sql.SQL(
            """
            CREATE TABLE IF NOT EXISTS {}.{} (
                id TEXT PRIMARY KEY,
                name TEXT,
                meta_data JSONB,
                filters JSONB,
                content TEXT,
                embedding VECTOR(1536),
                usage JSONB,
                content_hash TEXT
            )
            """
        ).format(sql.Identifier(db_schema), sql.Identifier(db_table))
    )
    cur.execute(
        sql.SQL("TRUNCATE TABLE {}.{}" ).format(sql.Identifier(db_schema), sql.Identifier(db_table))
    )
    return db_schema, db_table


def parse_embedding(raw: str) -> list[float]:
    if not raw:
        return []
    return list(json.loads(raw))


def main() -> None:
    import psycopg

    db_user = get_env("DB_USER", "postgres")
    db_password = get_env("DB_PASSWORD", "postgres")
    db_host = get_env("DB_HOST", "localhost")
    db_port = get_env("DB_PORT", "5432")
    db_name = get_env("DB_NAME", "concierge")

    dsn = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"

    with psycopg.connect(dsn, autocommit=True) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            db_schema, db_table = bootstrap_schema(cur)
            with SAMPLE_FILE.open() as fh:
                reader = csv.DictReader(fh, delimiter="\t")
                rows = list(reader)

            insert_stmt = sql.SQL(
                """
                INSERT INTO {}.{} (id, name, meta_data, filters, content, embedding, usage, content_hash)
                VALUES (%(id)s, %(name)s, %(meta_data)s, %(filters)s, %(content)s, %(embedding)s, %(usage)s, %(content_hash)s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    meta_data = EXCLUDED.meta_data,
                    filters = EXCLUDED.filters,
                    content = EXCLUDED.content,
                    embedding = EXCLUDED.embedding,
                    usage = EXCLUDED.usage,
                    content_hash = EXCLUDED.content_hash
                """
            ).format(sql.Identifier(db_schema), sql.Identifier(db_table))

            payload = []
            for row in rows:
                payload.append(
                    {
                        "id": row["id"],
                        "name": row.get("name"),
                        "meta_data": json.loads(row.get("meta_data", "{}")),
                        "filters": json.loads(row.get("filters", "{}")),
                        "content": row.get("content"),
                        "embedding": parse_embedding(row.get("embedding", "[]")),
                        "usage": json.loads(row.get("usage", "{}")),
                        "content_hash": row.get("content_hash"),
                    }
                )

            cur.executemany(insert_stmt, payload)
            print(f"Inserted {len(payload)} rows into {db_schema}.{db_table}")


if __name__ == "__main__":
    main()
