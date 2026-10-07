from __future__ import annotations

from typing import Protocol

from src.schemas.pipeline import ComponentContract


class ComponentAdapter(Protocol):
    """Nozomi's boundary around an execution backend such as Rikka."""

    def capabilities(self) -> tuple[ComponentContract, ...]: ...
