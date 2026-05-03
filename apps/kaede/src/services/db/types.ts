import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string | undefined>
type JsonRecord = Record<string, unknown>

export interface BuildingsTable {
  id: Generated<string>
  name: string
  latitude: number | null
  longitude: number | null
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface FloorsTable {
  id: Generated<string>
  building_id: string
  level: number
  name: string
  image_object_path: string
  scale: number | null
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface PedestriansTable {
  id: Generated<string>
  height: number | null
  stride_length: number | null
  attributes: ColumnType<JsonRecord, JsonRecord | undefined, JsonRecord | undefined>
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface RecordingsTable {
  id: Generated<string>
  pedestrian_id: string
  floor_id: string
  upload_status: string
  upload_targets: string[]
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
  deleted_at: Date | null
}

export interface TrajectoriesTable {
  id: Generated<string>
  recording_id: string
  floor_id: string
  status: string
  error_code: string | null
  error_message: string | null
  failed_at: Date | null
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
  deleted_at: Date | null
}

export interface TrajectoryConstraintsTable {
  trajectory_id: string
  seq: number
  point_type: string
  x: number
  y: number
  direction: number | null
  relative_timestamp: number | null
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface Database {
  buildings: BuildingsTable
  floors: FloorsTable
  pedestrians: PedestriansTable
  recordings: RecordingsTable
  trajectories: TrajectoriesTable
  trajectory_constraints: TrajectoryConstraintsTable
}

export type Building = Selectable<BuildingsTable>
export type NewBuilding = Insertable<BuildingsTable>
export type BuildingUpdate = Updateable<BuildingsTable>

export type Floor = Selectable<FloorsTable>
export type NewFloor = Insertable<FloorsTable>
export type FloorUpdate = Updateable<FloorsTable>

export type Pedestrian = Selectable<PedestriansTable>
export type NewPedestrian = Insertable<PedestriansTable>
export type PedestrianUpdate = Updateable<PedestriansTable>

export type Recording = Selectable<RecordingsTable>
export type NewRecording = Insertable<RecordingsTable>
export type RecordingUpdate = Updateable<RecordingsTable>

export type Trajectory = Selectable<TrajectoriesTable>
export type NewTrajectory = Insertable<TrajectoriesTable>
export type TrajectoryUpdate = Updateable<TrajectoriesTable>

export type TrajectoryConstraint = Selectable<TrajectoryConstraintsTable>
export type NewTrajectoryConstraint = Insertable<TrajectoryConstraintsTable>
export type TrajectoryConstraintUpdate = Updateable<TrajectoryConstraintsTable>
