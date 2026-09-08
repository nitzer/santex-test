import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]

DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{BASE_DIR / 'actions.db'}")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

DEFAULT_UPLOADS_DIR = BASE_DIR / "storage" / "uploads"

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.environ.get("LOG_FORMAT", "text").lower()  # "text" | "json"


def uploads_dir() -> Path:
    """Where uploaded documents are stored. Read per call so tests can redirect it."""
    configured = os.environ.get("UPLOADS_DIR")
    return Path(configured) if configured else DEFAULT_UPLOADS_DIR
