FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    DATABASE_URL=sqlite:////data/actions.db \
    UPLOADS_DIR=/data/uploads \
    CORS_ORIGINS=http://localhost:5173

WORKDIR /app

COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev

RUN useradd --uid 1001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data && chown -R app /data
USER app
VOLUME ["/data"]

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
