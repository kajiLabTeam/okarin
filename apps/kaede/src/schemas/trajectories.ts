import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, trajectoryStatusSchema, uuidSchema } from './common.js'

const finiteNumberSchema = z.number().finite()
const directionSchema = finiteNumberSchema.min(0).lt(360)

const startConstraintSchema = z.object({
  seq: z.number().int().min(0).openapi({
    description: 'constraint の並び順。0 始まりで欠番なく連続する整数',
  }),
  point_type: z.literal('start').openapi({
    description: '開始地点を表す固定値',
  }),
  x: finiteNumberSchema.openapi({
    description: 'フロア座標系での X 座標',
  }),
  y: finiteNumberSchema.openapi({
    description: 'フロア座標系での Y 座標',
  }),
  direction: directionSchema.optional().openapi({
    description: '進行方向。度数法で 0 以上 360 未満。0 はフロア座標系の +X 方向',
  }),
})

const waypointConstraintSchema = z.object({
  seq: z.number().int().min(0).openapi({
    description: 'constraint の並び順。0 始まりで欠番なく連続する整数',
  }),
  point_type: z.literal('waypoint').openapi({
    description: '経由点を表す固定値',
  }),
  x: finiteNumberSchema.openapi({
    description: 'フロア座標系での X 座標',
  }),
  y: finiteNumberSchema.openapi({
    description: 'フロア座標系での Y 座標',
  }),
  direction: directionSchema.optional().openapi({
    description: '進行方向。度数法で 0 以上 360 未満。0 はフロア座標系の +X 方向',
  }),
  relative_timestamp: z.number().int().min(0).openapi({
    description: '開始からの相対時刻',
  }),
})

const goalConstraintSchema = z.object({
  seq: z.number().int().min(0).openapi({
    description: 'constraint の並び順。0 始まりで欠番なく連続する整数',
  }),
  point_type: z.literal('goal').openapi({
    description: '終了地点を表す固定値',
  }),
  x: finiteNumberSchema.openapi({
    description: 'フロア座標系での X 座標',
  }),
  y: finiteNumberSchema.openapi({
    description: 'フロア座標系での Y 座標',
  }),
  direction: directionSchema.optional().openapi({
    description: '進行方向。度数法で 0 以上 360 未満。0 はフロア座標系の +X 方向',
  }),
})

export const trajectoryConstraintSchema = z.discriminatedUnion('point_type', [
  startConstraintSchema,
  waypointConstraintSchema,
  goalConstraintSchema,
])

export const createTrajectoryRequestSchema = z
  .object({
    constraints: z.array(trajectoryConstraintSchema).default([]).openapi({
      description: '開始点・経由点・終了点からなる制約点の一覧',
    }),
  })
  .superRefine((input, ctx) => {
    const constraints = input.constraints

    if (constraints.length === 0) {
      return
    }

    const startCount = constraints.filter((point) => point.point_type === 'start').length
    const goalCount = constraints.filter((point) => point.point_type === 'goal').length
    const seqs = constraints.map((point) => point.seq)

    if (startCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'constraints must contain exactly one start point',
        path: ['constraints'],
      })
    }

    if (goalCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'constraints must contain at most one goal point',
        path: ['constraints'],
      })
    }

    if (new Set(seqs).size !== seqs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'constraint seq must be unique',
        path: ['constraints'],
      })
    }

    for (const [index, seq] of seqs.entries()) {
      if (seq !== index) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'constraints must be ordered by seq starting at 0 with no gaps',
          path: ['constraints'],
        })
        break
      }
    }
  })

export const cloneAndReanalyzeRequestSchema = z.object({
  constraints: z
    .array(trajectoryConstraintSchema)
    .min(1)
    .superRefine((constraints, ctx) => {
      const startCount = constraints.filter((point) => point.point_type === 'start').length
      const goalCount = constraints.filter((point) => point.point_type === 'goal').length
      const seqs = constraints.map((point) => point.seq)

      if (startCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'constraints must contain exactly one start point',
          path: [],
        })
      }

      if (goalCount > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'constraints must contain at most one goal point',
          path: [],
        })
      }

      if (new Set(seqs).size !== seqs.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'constraint seq must be unique',
          path: [],
        })
      }

      for (const [index, seq] of seqs.entries()) {
        if (seq !== index) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'constraints must be ordered by seq starting at 0 with no gaps',
            path: [],
          })
          break
        }
      }
    })
    .openapi({
      description: 'clone-and-reanalyze で指定する新しい制約点一覧。1 件以上必須',
    }),
})

export const trajectoryIdParamsSchema = z.object({
  trajectoryId: uuidSchema.openapi({
    description: 'trajectory を一意に識別する ID',
  }),
})

export const createTrajectoryResponseSchema = z.object({
  trajectory_id: uuidSchema.openapi({
    description: '作成された trajectory の ID',
  }),
  recording_id: uuidSchema.openapi({
    description: '元になった recording の ID',
  }),
  organization_id: uuidSchema.openapi({
    description: 'trajectory が所属する organization の ID',
  }),
  status: z.literal('processing').openapi({
    description: 'trajectory 作成直後は processing 固定',
  }),
})

export const callbackRequestSchema = z.discriminatedUnion('status', [
  z.object({
    trajectory_id: uuidSchema.openapi({
      description: '完了した trajectory の ID',
    }),
    status: z.literal('completed').openapi({
      description: '解析が正常完了したことを表す固定値',
    }),
    callback_token: z.string().min(1).openapi({
      description: 'callback の認証トークン',
    }),
    result_object_key: z.string().min(1).openapi({
      description: '解析結果オブジェクトの保存先キー',
    }),
  }),
  z.object({
    trajectory_id: uuidSchema.openapi({
      description: '失敗した trajectory の ID',
    }),
    status: z.literal('failed').openapi({
      description: '解析失敗を表す固定値',
    }),
    callback_token: z.string().min(1).openapi({
      description: 'callback の認証トークン',
    }),
    error_code: z.string().min(1).openapi({
      description: '失敗種別を識別するエラーコード',
    }),
    error_message: z.string().min(1).openapi({
      description: '失敗内容の詳細メッセージ',
    }),
  }),
])

export const callbackErrorCodeSchema = z
  .enum([
    'CALLBACK_PAYLOAD_INVALID',
    'CALLBACK_TOKEN_INVALID',
    'CALLBACK_TOKEN_EXPIRED',
    'TRAJECTORY_NOT_FOUND',
    'CALLBACK_TRAJECTORY_MISMATCH',
    'CALLBACK_RESULT_OBJECT_KEY_MISMATCH',
    'CALLBACK_ALREADY_FINALIZED',
    'CALLBACK_DEPENDENCY_FAILURE',
  ])
  .openapi({
    description: 'callback endpoint が返す機械可読エラーコード',
    'x-enum-descriptions': {
      CALLBACK_PAYLOAD_INVALID: 'request body shape または必須項目が不正',
      CALLBACK_TOKEN_INVALID: 'callback token の署名または形式が不正',
      CALLBACK_TOKEN_EXPIRED: 'callback token の有効期限が切れている',
      TRAJECTORY_NOT_FOUND: '対象 trajectory が存在しない',
      CALLBACK_TRAJECTORY_MISMATCH: 'token と body の trajectory_id が一致しない',
      CALLBACK_RESULT_OBJECT_KEY_MISMATCH: 'result_object_key が想定保存先と一致しない',
      CALLBACK_ALREADY_FINALIZED: 'すでに終端状態であり今回 payload と矛盾する',
      CALLBACK_DEPENDENCY_FAILURE: '依存先確認または状態更新に失敗した',
    },
  })

export const callbackErrorResponseSchema = z.object({
  error_code: callbackErrorCodeSchema,
  error_message: z.string().min(1).openapi({
    description: 'ログや画面表示に使う説明文',
  }),
  details: z.record(z.string(), z.unknown()).optional().openapi({
    description: '追加情報がある場合のみ返す任意オブジェクト',
  }),
})

export const callbackResponseSchema = z.object({
  trajectory_id: uuidSchema.openapi({
    description: 'callback を受理した trajectory の ID',
  }),
  status: z.enum(['completed', 'failed']).openapi({
    description: 'callback 受理後の終端状態',
  }),
})

export const trajectoryStatusResponseSchema = z.object({
  trajectory_id: uuidSchema.openapi({
    description: 'trajectory の ID',
  }),
  recording_id: uuidSchema.openapi({
    description: '紐づく recording の ID',
  }),
  organization_id: uuidSchema.openapi({
    description: 'trajectory が所属する organization の ID',
  }),
  status: trajectoryStatusSchema,
  error_code: z.string().nullable().openapi({
    description: '失敗時のエラーコード。成功時は null',
  }),
  error_message: z.string().nullable().openapi({
    description: '失敗時の詳細メッセージ。成功時は null',
  }),
  failed_at: isoDatetimeSchema.nullable().openapi({
    description: '失敗日時。未失敗なら null',
  }),
})

export const trajectoryResultResponseSchema = z.object({
  trajectory_id: uuidSchema.openapi({
    description: 'result を取得する trajectory の ID',
  }),
  download_url: z.string().url().openapi({
    description: 'result.csv を取得するための署名付き URL',
  }),
  expires_at: isoDatetimeSchema.openapi({
    description: 'download_url の有効期限',
  }),
})

const mapPointSchema = z.object({
  x: finiteNumberSchema.openapi({
    description: 'フロア座標系での X 座標',
  }),
  y: finiteNumberSchema.openapi({
    description: 'フロア座標系での Y 座標',
  }),
  timestamp: z.number().int().min(0).openapi({
    description: '系列内の時刻',
  }),
})

export const mapDataTypeSchema = z.enum(['analyzed', 'ground_truth']).openapi({
  description: '地図描画データの種別',
})

export const trajectoryMapDataQuerySchema = z.object({
  data_type: mapDataTypeSchema.openapi({
    description: '取得したい map data の種別',
  }),
})

export const trajectoryMapDataResponseSchema = z.object({
  trajectory_id: uuidSchema.openapi({
    description: '地図描画対象 trajectory の ID',
  }),
  floor_id: uuidSchema.openapi({
    description: '描画対象 floor の ID',
  }),
  data_type: mapDataTypeSchema,
  points: z.array(mapPointSchema).openapi({
    description: '描画用の座標列',
  }),
})

export const batchTrajectoryMapDataRequestSchema = z.object({
  data_type: mapDataTypeSchema.openapi({
    description: 'まとめて取得したい map data の種別',
  }),
  trajectory_ids: z.array(uuidSchema).min(1).openapi({
    description: 'まとめて取得したい trajectory ID の一覧',
  }),
})

export const batchTrajectoryMapDataResponseSchema = z.object({
  floor_id: uuidSchema.openapi({
    description: '返却した軌跡群が属する floor の ID',
  }),
  trajectories: z
    .array(
      z.object({
        trajectory_id: uuidSchema.openapi({
          description: 'trajectory の ID',
        }),
        data_type: mapDataTypeSchema,
        points: z.array(mapPointSchema).openapi({
          description: '描画用の座標列',
        }),
      })
    )
    .openapi({
      description: 'trajectory ごとの描画データ',
    }),
})

export const retriedTrajectoryResponseSchema = z.object({
  source_trajectory_id: uuidSchema.openapi({
    description: '再解析元の trajectory の ID',
  }),
  trajectory_id: uuidSchema.openapi({
    description: '新しく作成された trajectory の ID',
  }),
  recording_id: uuidSchema.openapi({
    description: '元になった recording の ID',
  }),
  organization_id: uuidSchema.openapi({
    description: 'trajectory が所属する organization の ID',
  }),
  status: z.literal('processing').openapi({
    description: '再解析開始直後の状態',
  }),
})

export const uploadUrlWithPathResponseSchema = z.object({
  trajectory_id: uuidSchema.openapi({
    description: '対象 trajectory の ID',
  }),
  upload_url: z.string().url().openapi({
    description: 'アップロード用の署名付き URL',
  }),
  upload_path: z.string().min(1).openapi({
    description: 'アップロード先のオブジェクトパス',
  }),
  expires_at: isoDatetimeSchema.openapi({
    description: 'upload_url の有効期限',
  }),
})

export const trajectoryCompletionResponseSchema = z.object({
  trajectory_id: uuidSchema.openapi({
    description: '完了を反映した trajectory の ID',
  }),
  status: z.literal('completed').openapi({
    description: '完了状態',
  }),
})

export type CreateTrajectoryRequest = z.infer<typeof createTrajectoryRequestSchema>
export type CallbackRequest = z.infer<typeof callbackRequestSchema>
export type TrajectoryStatusResponse = z.infer<typeof trajectoryStatusResponseSchema>
