from typing import Literal
from uuid import UUID

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


class AnalyzeAcceptedResponse(BaseModel):
    trajectory_id: UUID = Field(description="受理した trajectory の ID")
    status: Literal["accepted"] = Field(description="解析要求を受理した状態")
    message: str = Field(description="現在の実装状態を含む補足メッセージ")


class ErrorResponse(BaseModel):
    detail: str = Field(description="エラー内容")
