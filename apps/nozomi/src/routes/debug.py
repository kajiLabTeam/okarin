from __future__ import annotations

import importlib
import importlib.metadata
import inspect
import pkgutil
from collections.abc import Callable
from typing import Any, cast

from fastapi import APIRouter, HTTPException, status

debug_router = APIRouter()

RIKKA_ROOT = "rikka"
CANDIDATE_MODULES = (
    "rikka",
    "rikka.main",
    "rikka.client",
    "rikka.api",
    "rikka.pdr",
)


def _import_module(module_name: str) -> Any:
    return importlib.import_module(module_name)


def _find_ping_in_module(module_name: str) -> Callable[..., Any] | None:
    module = _import_module(module_name)
    ping = getattr(module, "ping", None)
    if ping is None or not callable(ping):
        return None
    return cast(Callable[..., Any], ping)


def _discover_ping() -> tuple[Callable[..., Any], str, list[str]]:
    checked_modules: list[str] = []

    for module_name in CANDIDATE_MODULES:
        try:
            ping = _find_ping_in_module(module_name)
        except ModuleNotFoundError:
            checked_modules.append(f"{module_name} (module not found)")
            continue
        except Exception as exc:
            checked_modules.append(f"{module_name} (import failed: {exc})")
            continue

        checked_modules.append(module_name)
        if ping is not None:
            return ping, module_name, checked_modules

    root_module = _import_module(RIKKA_ROOT)

    if not hasattr(root_module, "__path__"):
        return _missing_ping(checked_modules)

    for module_info in pkgutil.walk_packages(
        root_module.__path__, prefix=f"{RIKKA_ROOT}."
    ):
        module_name = module_info.name
        if module_name in CANDIDATE_MODULES:
            continue

        try:
            ping = _find_ping_in_module(module_name)
        except Exception as exc:
            checked_modules.append(f"{module_name} (import failed: {exc})")
            continue

        checked_modules.append(module_name)
        if ping is not None:
            return ping, module_name, checked_modules

    return _missing_ping(checked_modules)


def _missing_ping(
    checked_modules: list[str],
) -> tuple[Callable[..., Any], str, list[str]]:
    checked = ", ".join(checked_modules)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"`ping()` was not found. Checked: {checked}",
    )


@debug_router.get(
    "/rikka/ping",
    status_code=status.HTTP_200_OK,
    summary="rikka ping 接続確認",
    description="rikka package の ping() を呼び出して疎通確認する。",
    tags=["debug"],
)
def read_rikka_ping() -> dict[str, Any]:
    try:
        rikka_version = importlib.metadata.version("rikka")
        ping, module_name, checked_modules = _discover_ping()
        signature = inspect.signature(ping)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to prepare rikka ping: {exc}",
        ) from exc

    if signature.parameters:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "`ping()` requires arguments in this rikka build. "
                "Update src/routes/debug.py to pass the expected parameters."
            ),
        )

    try:
        result = ping()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"rikka ping failed: {exc}",
        ) from exc

    return {
        "ok": True,
        "rikka_version": rikka_version,
        "ping_module": module_name,
        "checked_modules": checked_modules,
        "result": result,
    }
