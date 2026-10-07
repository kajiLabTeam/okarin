from __future__ import annotations

import os
from enum import StrEnum
from urllib.parse import urlparse


class UrlPurpose(StrEnum):
    STORAGE = "storage"
    CALLBACK = "callback"


def _origin(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("URL must use http or https and include a host")
    if parsed.username or parsed.password:
        raise ValueError("URL must not contain credentials")
    default_port = 443 if parsed.scheme == "https" else 80
    port = parsed.port or default_port
    return f"{parsed.scheme}://{parsed.hostname.lower()}:{port}"


def _configured_origins(purpose: UrlPurpose) -> frozenset[str]:
    if purpose == UrlPurpose.STORAGE:
        configured: tuple[str, ...] = (
            os.getenv("S3_INTERNAL_ENDPOINT", "http://seaweedfs:8333"),
            os.getenv("S3_PUBLIC_ENDPOINT", ""),
        )
        extra = os.getenv("NOZOMI_ALLOWED_STORAGE_ORIGINS", "")
    else:
        configured = (os.getenv("KAEDE_INTERNAL_BASE_URL", "http://kaede:8080"),)
        extra = os.getenv("NOZOMI_ALLOWED_CALLBACK_ORIGINS", "")
    values = (*configured, *(item.strip() for item in extra.split(",")))
    return frozenset(_origin(value) for value in values if value)


def validate_outbound_url(value: str, purpose: UrlPurpose) -> str:
    """Allow outbound requests only to explicitly configured service origins."""
    origin = _origin(value)
    if origin not in _configured_origins(purpose):
        raise ValueError(f"URL origin is not allowed for {purpose.value}: {origin}")

    parsed = urlparse(value)
    # Public callback endpoints carry service credentials and must use TLS. Plain
    # HTTP remains valid only for the exact internal service origin configured for
    # Docker DNS.
    if purpose == UrlPurpose.CALLBACK and parsed.scheme != "https":
        internal = os.getenv("KAEDE_INTERNAL_BASE_URL", "http://kaede:8080")
        if origin != _origin(internal):
            raise ValueError("public callback URL must use https")
    return value


def configured_callback_url() -> str:
    value = os.getenv(
        "NOZOMI_PIPELINE_CALLBACK_URL",
        "http://kaede:8080/api/internal/pipeline-executions/callbacks",
    )
    return validate_outbound_url(value, UrlPurpose.CALLBACK)
