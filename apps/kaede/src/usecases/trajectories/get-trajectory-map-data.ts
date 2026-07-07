import type { RequestActor } from '../../middleware/request-actor-context.js'
import type {
  TrajectoryMapDataQuery,
  TrajectoryMapDataResponse,
} from '../../schemas/trajectories.js'
import { getTrajectoryAnalyzedResultObjectText } from '../../services/storage/index.js'
import { findTrajectoryById } from '../../services/trajectories/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireOrganizationManager } from '../authorization.js'

type MapPoint = TrajectoryMapDataResponse['points'][number]

export type GetTrajectoryMapDataError =
  | AuthorizationError
  | {
      type: 'TRAJECTORY_NOT_FOUND'
      trajectoryId: string
    }
  | {
      type: 'TRAJECTORY_MAP_DATA_NOT_READY'
      trajectoryId: string
      status: string
    }
  | {
      type: 'TRAJECTORY_MAP_DATA_NOT_FOUND'
      trajectoryId: string
    }
  | {
      type: 'TRAJECTORY_MAP_DATA_INVALID'
      trajectoryId: string
      reason: string
    }
  | {
      type: 'TRAJECTORY_MAP_DATA_TYPE_UNSUPPORTED'
      dataType: string
    }

export type GetTrajectoryMapDataResult =
  | {
      ok: true
      value: TrajectoryMapDataResponse
    }
  | {
      ok: false
      error: GetTrajectoryMapDataError
    }

const parseCsvLine = (line: string) => line.split(',').map((cell) => cell.trim())

const parseAnalyzedResultCsv = (
  csvText: string
): { ok: true; points: MapPoint[] } | { ok: false; reason: string } => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return {
      ok: false,
      reason: 'csv is empty',
    }
  }

  const headers = parseCsvLine(lines[0] ?? '')
  const xIndex = headers.indexOf('x')
  const yIndex = headers.indexOf('y')

  if (xIndex === -1 || yIndex === -1) {
    return {
      ok: false,
      reason: 'csv missing required columns: x, y',
    }
  }

  const points: MapPoint[] = []

  for (const [lineIndex, line] of lines.slice(1).entries()) {
    const cells = parseCsvLine(line)
    const x = Number(cells[xIndex])
    const y = Number(cells[yIndex])

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return {
        ok: false,
        reason: `csv contains invalid point at row ${lineIndex + 2}`,
      }
    }

    points.push({
      timestamp: lineIndex,
      x,
      y,
    })
  }

  return {
    ok: true,
    points,
  }
}

export const getTrajectoryMapData = async (
  actor: RequestActor,
  params: { trajectoryId: string },
  query: TrajectoryMapDataQuery
): Promise<GetTrajectoryMapDataResult> => {
  if (query.data_type !== 'analyzed') {
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_TYPE_UNSUPPORTED',
        dataType: query.data_type,
      },
    }
  }

  const trajectory = await findTrajectoryById(params.trajectoryId)

  if (!trajectory) {
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId: params.trajectoryId,
      },
    }
  }

  const authorization = requireOrganizationManager(actor, trajectory.organization_id)

  if (!authorization.ok) {
    return authorization
  }

  if (trajectory.status !== 'completed') {
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_NOT_READY',
        trajectoryId: trajectory.id,
        status: trajectory.status,
      },
    }
  }

  const csvText = await getTrajectoryAnalyzedResultObjectText(trajectory.id)

  if (csvText === undefined) {
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_NOT_FOUND',
        trajectoryId: trajectory.id,
      },
    }
  }

  const parsed = parseAnalyzedResultCsv(csvText)

  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_INVALID',
        trajectoryId: trajectory.id,
        reason: parsed.reason,
      },
    }
  }

  return {
    ok: true,
    value: {
      trajectory_id: trajectory.id,
      floor_id: trajectory.floor_id,
      data_type: 'analyzed',
      points: parsed.points,
    },
  }
}
