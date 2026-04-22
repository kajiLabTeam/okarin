import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, trajectoryStatusSchema, uuidSchema } from './common.js'

const finiteNumberSchema = z.number().finite()

const startConstraintSchema = z.object({
  seq: z.number().int().min(0).openapi({
    description: 'constraint の並び順。0 以上の一意な整数',
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
  direction: finiteNumberSchema.optional().openapi({
    description: '進行方向。単位は実装側で定義する',
  }),
})

const waypointConstraintSchema = z.object({
  seq: z.number().int().min(0).openapi({
    description: 'constraint の並び順。0 以上の一意な整数',
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
  direction: finiteNumberSchema.optional().openapi({
    description: '進行方向。単位は実装側で定義する',
  }),
  relative_timestamp: z.number().int().min(0).openapi({
    description: '開始からの相対時刻',
  }),
})

const goalConstraintSchema = z.object({
  seq: z.number().int().min(0).openapi({
    description: 'constraint の並び順。0 以上の一意な整数',
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
  direction: finiteNumberSchema.optional().openapi({
    description: '進行方向。単位は実装側で定義する',
  }),
})

export const trajectoryConstraintSchema = z.discriminatedUnion('point_type', [
  startConstraintSchema,
  waypointConstraintSchema,
  goalConstraintSchema,
])

export const createTrajectoryRequestSchema = z
  .object({
    constraints: z.array(trajectoryConstraintSchema).min(1).openapi({
      description: '開始点・経由点・終了点からなる制約点の一覧',
    }),
  })
  .superRefine((input, ctx) => {
    const startCount = input.constraints.filter((point) => point.point_type === 'start').length
    const goalCount = input.constraints.filter((point) => point.point_type === 'goal').length
    const seqs = input.constraints.map((point) => point.seq)

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

export const callbackResponseSchema = z.object({
  trajectory_id: uuidSchema.openapi({
    description: 'callback を受理した trajectory の ID',
  }),
  status: trajectoryStatusSchema,
})

export const trajectoryStatusResponseSchema = z.object({
  trajectory_id: uuidSchema.openapi({
    description: 'trajectory の ID',
  }),
  recording_id: uuidSchema.openapi({
    description: '紐づく recording の ID',
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

export type CreateTrajectoryRequest = z.infer<typeof createTrajectoryRequestSchema>
export type CallbackRequest = z.infer<typeof callbackRequestSchema>
