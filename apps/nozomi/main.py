from typing import Literal
from uuid import UUID

from fastapi import FastAPI, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class StartConstraint(BaseModel):
    seq: int = Field(ge=0, description="constraint の並び順。0 以上の一意な整数")
    point_type: Literal["start"] = Field(description="開始地点を表す固定値")
    x: float = Field(description="フロア座標系での X 座標")
    y: float = Field(description="フロア座標系での Y 座標")
    direction: float | None = Field(
        default=None, description="進行方向。単位は実装側で定義する"
    )


class WaypointConstraint(BaseModel):
    seq: int = Field(ge=0, description="constraint の並び順。0 以上の一意な整数")
    point_type: Literal["waypoint"] = Field(description="経由点を表す固定値")
    x: float = Field(description="フロア座標系での X 座標")
    y: float = Field(description="フロア座標系での Y 座標")
    direction: float | None = Field(
        default=None, description="進行方向。単位は実装側で定義する"
    )
    relative_timestamp: int = Field(ge=0, description="開始からの相対時刻")


class GoalConstraint(BaseModel):
    seq: int = Field(ge=0, description="constraint の並び順。0 以上の一意な整数")
    point_type: Literal["goal"] = Field(description="終了地点を表す固定値")
    x: float = Field(description="フロア座標系での X 座標")
    y: float = Field(description="フロア座標系での Y 座標")
    direction: float | None = Field(
        default=None, description="進行方向。単位は実装側で定義する"
    )


Constraint = StartConstraint | WaypointConstraint | GoalConstraint


class RawDataUrls(BaseModel):
    acce: HttpUrl = Field(description="加速度センサ raw データ取得用 URL")
    gyro: HttpUrl = Field(description="ジャイロセンサ raw データ取得用 URL")
    pressure: HttpUrl | None = Field(
        default=None, description="気圧センサ raw データ取得用 URL"
    )
    wifi: HttpUrl | None = Field(
        default=None, description="Wi-Fi スキャン raw データ取得用 URL"
    )


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "trajectory_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
                "recording_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
                "floor_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "constraints": [
                    {
                        "seq": 0,
                        "point_type": "start",
                        "x": 12.34,
                        "y": 56.78,
                        "direction": 90.0,
                    },
                    {
                        "seq": 1,
                        "point_type": "waypoint",
                        "x": 18.2,
                        "y": 60.1,
                        "relative_timestamp": 12000,
                    },
                    {
                        "seq": 2,
                        "point_type": "goal",
                        "x": 30.5,
                        "y": 72.4,
                        "direction": 30.0,
                    },
                ],
                "raw_data_urls": {
                    "acce": "https://object-storage.example.com/acce.csv",
                    "gyro": "https://object-storage.example.com/gyro.csv",
                    "pressure": "https://object-storage.example.com/pressure.csv",
                },
                "result_upload_url": "https://object-storage.example.com/result.csv",
                "callback_url": "https://mediator.example.com/api/trajectories/callback",
                "callback_token": "signed-callback-token",
            }
        }
    )

    trajectory_id: UUID = Field(description="解析対象 trajectory の ID")
    recording_id: UUID = Field(description="元になった recording の ID")
    floor_id: UUID = Field(description="解析対象の floor ID")
    constraints: list[Constraint] = Field(
        min_length=1, description="開始点・経由点・終了点からなる制約点の一覧"
    )
    raw_data_urls: RawDataUrls = Field(description="raw データ取得用の署名付き URL 群")
    result_upload_url: HttpUrl = Field(
        description="解析結果 result.csv 保存用の署名付き URL"
    )
    callback_url: HttpUrl = Field(description="解析完了後に通知する callback URL")
    callback_token: str = Field(
        min_length=1, description="仲介サーバーが検証する callback 用トークン"
    )

    @model_validator(mode="after")
    def validate_constraints(self) -> AnalyzeRequest:
        start_count = sum(
            1
            for point in self.constraints
            if getattr(point, "point_type", None) == "start"
        )
        goal_count = sum(
            1
            for point in self.constraints
            if getattr(point, "point_type", None) == "goal"
        )
        seqs = [point.seq for point in self.constraints]

        if start_count != 1:
            raise ValueError("constraints must contain exactly one start point")
        if goal_count > 1:
            raise ValueError("constraints must contain at most one goal point")
        if len(set(seqs)) != len(seqs):
            raise ValueError("constraint seq must be unique")

        return self


class HealthResponse(BaseModel):
    service: Literal["nozomi"]
    role: Literal["analysis"]
    status: Literal["ok"]


class AnalyzeAcceptedResponse(BaseModel):
    trajectory_id: UUID = Field(description="受理した trajectory の ID")
    status: Literal["accepted"] = Field(description="解析要求を受理した状態")
    message: str = Field(description="現在の実装状態を含む補足メッセージ")


class ErrorResponse(BaseModel):
    detail: str = Field(description="エラー内容")


app = FastAPI(
    title="nozomi API",
    description=(
        "nozomi は解析サーバーとして動作する API サーバーであり、"
        "仲介サーバーから受け取った解析依頼を処理する。"
    ),
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url="/specification",
    openapi_tags=[
        {
            "name": "health",
            "description": "運用監視や疎通確認に使う endpoint 群",
        },
        {
            "name": "analysis",
            "description": "仲介サーバーからの解析依頼を受け付ける endpoint 群",
        },
        {
            "name": "debug",
            "description": "rikka 連携の確認用 endpoint 群",
        },
    ],
)


def _scalar_fallback_html(openapi_url: str) -> HTMLResponse:
    return HTMLResponse(
        f"""<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>nozomi API</title>
  </head>
  <body>
    <script id="api-reference" data-url="{openapi_url}"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>"""
    )


@app.get(
    "/",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="ヘルスチェック",
    description="解析サーバーとしての疎通確認に使う基本 endpoint。",
    tags=["health"],
)
def read_root() -> HealthResponse:
    return HealthResponse(service="nozomi", role="analysis", status="ok")


@app.get(
    "/doc",
    include_in_schema=False,
    summary="Scalar API reference",
    description="nozomi API の Scalar ドキュメントを返す。",
)
async def scalar_reference() -> HTMLResponse:
    openapi_url = app.openapi_url or "/specification"

    try:
        from scalar_fastapi import get_scalar_api_reference
    except ImportError:  # pragma: no cover - fallback for environments before uv sync
        return _scalar_fallback_html(openapi_url)

    return get_scalar_api_reference(
        openapi_url=openapi_url,
        title="nozomi API",
        scalar_proxy_url="https://proxy.scalar.com",
    )


@app.post(
    "/analyze",
    response_model=AnalyzeAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="解析依頼を受け付ける",
    description=(
        "仲介サーバーから raw データ取得用 URL、解析結果保存用 URL、"
        "callback 情報、制約点情報を受け取り、解析ジョブを受理する。"
    ),
    tags=["analysis"],
    responses={
        422: {
            "description": "request body が不正",
            "model": ErrorResponse,
        }
    },
)
def analyze(payload: AnalyzeRequest) -> AnalyzeAcceptedResponse:
    return AnalyzeAcceptedResponse(
        trajectory_id=payload.trajectory_id,
        status="accepted",
        message="analysis request accepted; execution pipeline is not implemented yet",
    )
