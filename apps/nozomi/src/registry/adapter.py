from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.schemas.pipeline import ComponentContract


class ComponentAdapter(Protocol):
    """Nozomi's boundary around an execution backend such as Rikka."""

    def capabilities(self) -> tuple[ComponentContract, ...]: ...


@dataclass(frozen=True)
class RikkaAdapter:
    """Only exposes capability proven by the installed Rikka integration."""

    def capabilities(self) -> tuple[ComponentContract, ...]:
        # Current Rikka exposes only pdr without multi-component contracts.
        return ()
