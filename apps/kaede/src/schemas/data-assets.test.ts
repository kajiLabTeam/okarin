import { describe, expect, it } from 'vitest'
import { loadDataTypeDefinition } from '../services/data-assets/catalog.js'
import { initRecordingRequestSchema } from './recordings.js'

describe('data asset recording input', () => {
  const base = {
    pedestrian_id: '00000000-0000-4000-8000-000000000001',
    floor_id: '00000000-0000-4000-8000-000000000002',
  }

  it('accepts optional typed assets without legacy upload_targets', () => {
    const result = initRecordingRequestSchema.safeParse({
      ...base,
      assets: [{ data_type: 'acce', schema_version: '1', format: 'csv' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects duplicate data types within one recording', () => {
    const result = initRecordingRequestSchema.safeParse({
      ...base,
      assets: [
        { data_type: 'acce', schema_version: '1', format: 'csv' },
        { data_type: 'acce', schema_version: '1', format: 'csv' },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects legacy and asset inputs being supplied together', () => {
    const result = initRecordingRequestSchema.safeParse({
      ...base,
      upload_targets: ['acce'],
      assets: [{ data_type: 'gyro', schema_version: '1', format: 'csv' }],
    })
    expect(result.success).toBe(false)
  })

  it('keeps legacy upload_targets valid', () => {
    const result = initRecordingRequestSchema.safeParse({
      ...base,
      upload_targets: ['acce', 'gyro'],
    })
    expect(result.success).toBe(true)
  })

  it('loads the shared catalog and rejects unknown definitions', async () => {
    await expect(loadDataTypeDefinition('acce', '1', 'csv')).resolves.toMatchObject({
      data_type: 'acce',
      schema_version: '1',
      required_columns: ['timestamp_ns', 'wall_time_ms', 'x', 'y', 'z'],
    })
    await expect(loadDataTypeDefinition('acce', 'v1', 'csv')).resolves.toMatchObject({
      data_type: 'acce',
      schema_version: '1',
      required_columns: ['timestamp_ns', 'wall_time_ms', 'x', 'y', 'z'],
    })
    await expect(loadDataTypeDefinition('gyro', '1', 'csv')).resolves.toMatchObject({
      data_type: 'gyro',
      schema_version: '1',
      required_columns: ['timestamp_ns', 'wall_time_ms', 'x', 'y', 'z'],
    })
    await expect(loadDataTypeDefinition('unknown', '1', 'csv')).resolves.toBeUndefined()
    await expect(loadDataTypeDefinition('acce', '2', 'csv')).resolves.toBeUndefined()
    await expect(loadDataTypeDefinition('acce', '1', 'json')).resolves.toBeUndefined()
  })
})
