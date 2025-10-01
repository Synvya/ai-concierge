#!/usr/bin/env python3
"""Render an ECS task definition JSON document from template inputs."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render ECS task definition JSON")
    parser.add_argument("--family", required=True, help="Task definition family name")
    parser.add_argument("--image", required=True, help="Container image URI")
    parser.add_argument("--cpu", default="512", help="Task CPU units (as string)")
    parser.add_argument("--memory", default="1024", help="Task memory (MiB, as string)")
    parser.add_argument("--execution-role", required=True, help="ECS execution role ARN")
    parser.add_argument("--task-role", required=True, help="ECS task role ARN")
    parser.add_argument("--log-group", required=True, help="CloudWatch Logs group name")
    parser.add_argument("--log-region", required=True, help="CloudWatch Logs AWS region")
    parser.add_argument(
        "--environment-json",
        default="{}",
        help="Plain JSON string, env:VAR, or file:/path for environment variables",
    )
    parser.add_argument(
        "--secret-json",
        default="{}",
        help="Plain JSON string, env:VAR, or file:/path for secrets",
    )
    parser.add_argument(
        "--output",
        default="taskdef.json",
        type=Path,
        help="Output file path",
    )
    return parser.parse_args()


def _dict_to_env_list(data: dict[str, str]) -> list[dict[str, str]]:
    return [{"name": key, "value": str(value)} for key, value in sorted(data.items())]


def _dict_to_secret_list(data: dict[str, str]) -> list[dict[str, str]]:
    return [{"name": key, "valueFrom": value} for key, value in sorted(data.items())]


def _load_json(value: str) -> dict[str, str]:
    if not value:
        return {}
    if value.startswith("env:"):
        env_var = value.split(":", 1)[1]
        return _load_json(os.getenv(env_var, "{}"))
    if value.startswith("file:"):
        file_path = Path(value.split(":", 1)[1])
        return _load_json(file_path.read_text(encoding="utf-8"))
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON value '{value}': {exc}") from exc


def main() -> int:
    args = parse_args()

    environment_map = _load_json(args.environment_json or "{}")
    secret_map = _load_json(args.secret_json or "{}")

    task_definition = {
        "family": args.family,
        "networkMode": "awsvpc",
        "requiresCompatibilities": ["FARGATE"],
        "cpu": str(args.cpu),
        "memory": str(args.memory),
        "executionRoleArn": args.execution_role,
        "taskRoleArn": args.task_role,
        "containerDefinitions": [
            {
                "name": "api",
                "image": args.image,
                "essential": True,
                "portMappings": [
                    {
                        "containerPort": 8000,
                        "hostPort": 8000,
                        "protocol": "tcp",
                    }
                ],
                "environment": _dict_to_env_list(environment_map),
                "secrets": _dict_to_secret_list(secret_map),
                "logConfiguration": {
                    "logDriver": "awslogs",
                    "options": {
                        "awslogs-group": args.log_group,
                        "awslogs-region": args.log_region,
                        "awslogs-stream-prefix": "api",
                    },
                },
            }
        ],
    }

    args.output.write_text(json.dumps(task_definition, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
