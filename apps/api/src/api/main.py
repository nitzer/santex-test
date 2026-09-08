import json
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from sqlmodel import Session

from api.config import CORS_ORIGINS
from api.db import create_db_and_tables, engine
from api.observability import RequestContextMiddleware, configure_logging
from api.routers.action_types import router as action_types_router
from api.routers.actions import router as actions_router
from api.seed import seed

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    create_db_and_tables()
    with Session(engine) as session:
        seed(session)
    yield


app = FastAPI(
    title="Pending Actions API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
# Added last so it is the outermost layer: every request, CORS preflights included, gets an id.
app.add_middleware(RequestContextMiddleware)

app.include_router(action_types_router)
app.include_router(actions_router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


def _ref_unions_as_oneof(schema: dict) -> dict:
    """Pydantic emits `anyOf` for every plain union; for a set of named model refs the
    intent is `oneOf` (exactly one), which is what the front's codegen expects."""
    for model in schema.get("components", {}).get("schemas", {}).values():
        for prop in model.get("properties", {}).values():
            variants = prop.get("anyOf")
            if variants and len(variants) > 1 and all("$ref" in v for v in variants):
                prop["oneOf"] = prop.pop("anyOf")
    return schema


def custom_openapi() -> dict:
    if not app.openapi_schema:
        app.openapi_schema = _ref_unions_as_oneof(get_openapi(
            title=app.title,
            version=app.version,
            routes=app.routes,
        ))
    return app.openapi_schema


app.openapi = custom_openapi


def export_openapi(destination: str = "openapi.json") -> Path:
    path = Path(destination)
    path.write_text(json.dumps(app.openapi(), indent=2) + "\n")
    return path


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "export-openapi":
        target = sys.argv[2] if len(sys.argv) > 2 else "openapi.json"
        print(f"wrote {export_openapi(target)}")
    else:
        print("usage: python -m api.main export-openapi [path]", file=sys.stderr)
        raise SystemExit(1)
