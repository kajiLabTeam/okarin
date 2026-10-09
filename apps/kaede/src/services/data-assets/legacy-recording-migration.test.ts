import { describe, expect, it } from 'vitest'
import { parseMigrateLegacyRecordingsCliArgs } from '../../cli/migrate-legacy-recordings-to-data-assets-options.js'
import { legacySensorTargets } from './legacy-recording-migration-helpers.js'

describe('legacy recording migration', () => {
  it('旧形式のセンサー対象から移行可能なデータ種別だけを選ぶ', () => {
    expect(legacySensorTargets(['metadata', 'acce', 'gyro', 'wifi'])).toEqual(['acce', 'gyro'])
  })

  it('metadataは旧形式のセンサー移行対象に含めない', () => {
    expect(legacySensorTargets(['metadata'])).toEqual([])
  })

  it('CLIは既定でdry-runになり、実行は明示指定する', () => {
    expect(parseMigrateLegacyRecordingsCliArgs([])).toEqual({ dryRun: true, help: false })
    expect(parseMigrateLegacyRecordingsCliArgs(['--execute'])).toEqual({
      dryRun: false,
      help: false,
    })
    expect(parseMigrateLegacyRecordingsCliArgs(['--dry-run'])).toEqual({
      dryRun: true,
      help: false,
    })
  })

  it('未知のCLIオプションを拒否する', () => {
    expect(parseMigrateLegacyRecordingsCliArgs(['--force'])).toEqual({
      error: 'unknown option: --force',
    })
  })
})
