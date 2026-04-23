from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    service: Literal["nozomi"]
    role: Literal["analysis"]
    status: Literal["ok"]
