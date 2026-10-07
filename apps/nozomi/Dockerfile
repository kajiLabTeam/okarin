FROM python:3.14-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PYTHON_DOWNLOADS=0 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.12.0 /uv /uvx /bin/

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --no-editable

COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable --compile-bytecode


FROM python:3.14-slim AS runner

ARG APP_VERSION=dev
ARG VCS_REF=unknown

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

LABEL org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$VCS_REF

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /var/lib/nozomi \
    && chown appuser:appuser /var/lib/nozomi

COPY --from=builder /app/.venv /app/.venv
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/nozomi-entrypoint

ENTRYPOINT ["nozomi-entrypoint"]

CMD ["start"]
