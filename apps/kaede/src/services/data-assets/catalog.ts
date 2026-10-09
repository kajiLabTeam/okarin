import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface DataTypeDefinition {
  data_type: string
  schema_version: string
  format: string
  content_types: string[]
  required_columns: string[]
  timestamp_column?: string
  wall_time_column?: string
  column_types: Record<string, 'integer' | 'number' | 'string'>
}

const dataTypeDefinitionSchema = z
  .object({
    data_type: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    schema_version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    format: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    content_types: z.array(z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/)).min(1),
    required_columns: z.array(z.string().min(1)).min(1),
    timestamp_column: z.string().min(1).optional(),
    wall_time_column: z.string().min(1).optional(),
    column_types: z.record(z.enum(['integer', 'number', 'string'])),
  })
  .strict()

const builtInCatalogDefinitions: Record<string, DataTypeDefinition> = {
  'acce:1:csv': {
    data_type: 'acce',
    schema_version: '1',
    format: 'csv',
    content_types: ['text/csv'],
    required_columns: ['timestamp_ns', 'wall_time_ms', 'x', 'y', 'z'],
    timestamp_column: 'timestamp_ns',
    wall_time_column: 'wall_time_ms',
    column_types: {
      timestamp_ns: 'integer',
      wall_time_ms: 'integer',
      x: 'number',
      y: 'number',
      z: 'number',
    },
  },
  'gyro:1:csv': {
    data_type: 'gyro',
    schema_version: '1',
    format: 'csv',
    content_types: ['text/csv'],
    required_columns: ['timestamp_ns', 'wall_time_ms', 'x', 'y', 'z'],
    timestamp_column: 'timestamp_ns',
    wall_time_column: 'wall_time_ms',
    column_types: {
      timestamp_ns: 'integer',
      wall_time_ms: 'integer',
      x: 'number',
      y: 'number',
      z: 'number',
    },
  },
  'ble:1:csv': {
    data_type: 'ble',
    schema_version: '1',
    format: 'csv',
    content_types: ['text/csv'],
    required_columns: [
      'event_seq',
      'timestamp_ns',
      'wall_time_ms',
      'beacon_id',
      'ibeacon_uuid',
      'major',
      'minor',
      'rssi_dbm',
      'raw_data_hex',
    ],
    timestamp_column: 'timestamp_ns',
    wall_time_column: 'wall_time_ms',
    column_types: {
      event_seq: 'integer',
      timestamp_ns: 'integer',
      wall_time_ms: 'integer',
      beacon_id: 'string',
      ibeacon_uuid: 'string',
      major: 'integer',
      minor: 'integer',
      rssi_dbm: 'integer',
      raw_data_hex: 'string',
    },
  },
}

const catalogRoots = [
  resolve(process.cwd(), 'contracts/data-types'),
  resolve(process.cwd(), '../../contracts/data-types'),
]
const safePart = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export const loadDataTypeDefinition = async (
  dataType: string,
  schemaVersion: string,
  format: string
): Promise<DataTypeDefinition | undefined> => {
  if (![dataType, schemaVersion, format].every((value) => safePart.test(value))) return undefined
  const normalizedVersion = schemaVersion.replace(/^v/i, '')
  for (const root of catalogRoots) {
    try {
      const value = dataTypeDefinitionSchema.parse(
        JSON.parse(await readFile(resolve(root, `${dataType}.v${normalizedVersion}.json`), 'utf8'))
      )
      if (
        value.data_type === dataType &&
        (value.schema_version === schemaVersion || value.schema_version === normalizedVersion) &&
        value.format === format
      ) {
        return value
      }
    } catch {
      // Try the second monorepo-relative location.
    }
  }
  return builtInCatalogDefinitions[`${dataType}:${normalizedVersion}:${format}`]
}
