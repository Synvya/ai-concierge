# Contributing to AI Concierge

## Code Formatting

### Backend (Python)

This project uses **ruff** for Python linting and formatting.

#### Auto-formatting via Pre-commit Hook

A pre-commit hook automatically runs `ruff check --fix` on all backend code before each commit. This ensures:
- Consistent code style across all commits
- Import ordering follows Python conventions
- No linting errors reach CI

**No action needed** - formatting happens automatically when you commit!

#### Manual Formatting

If you need to format code manually:

```bash
cd backend
python -m ruff check --fix .
```

#### Editor Settings

**Important:** Disable "Format on Save" in your editor to avoid conflicts with the pre-commit hook.

For Cursor/VS Code, the repository includes `.cursor/settings.json` with the correct settings.

### Frontend (TypeScript)

Follow existing code patterns. TypeScript strict mode is enabled.

## Testing

### Backend

```bash
cd backend
pytest
```

### Frontend

```bash
cd frontend
npm test
```

## CI/CD

GitHub Actions runs:
- Backend: `ruff check`, `mypy`, `pytest`
- Frontend: TypeScript check, tests, build

All checks must pass before merging.

