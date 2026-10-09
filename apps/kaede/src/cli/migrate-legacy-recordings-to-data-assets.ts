import { pathToFileURL } from 'node:url'
import type { db as databaseInstance } from '../services/db/index.js'
import { parseMigrateLegacyRecordingsCliArgs } from './migrate-legacy-recordings-to-data-assets-options.js'

const showUsage = (stdout: Pick<NodeJS.WriteStream, 'write'>) => {
  stdout.write(
    [
      'Usage: pnpm migrate:legacy-recordings [--dry-run|--execute]',
      '',
      'Options:',
      '  --dry-run   Inspect and report without writing DB rows (default)',
      '  --execute   Create data-assets links for valid legacy raw objects',
      '  -h, --help  Show this help message',
    ].join('\n') + '\n'
  )
}

export const runMigrateLegacyRecordingsCli = async (
  args: readonly string[] = process.argv.slice(2),
  stdout: Pick<NodeJS.WriteStream, 'write'> = process.stdout,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> => {
  const options = parseMigrateLegacyRecordingsCliArgs(args)
  if ('error' in options) {
    stderr.write(`${options.error}\n`)
    showUsage(stderr)
    return 1
  }
  if (options.help) {
    showUsage(stdout)
    return 0
  }

  let database: typeof databaseInstance | undefined
  try {
    const [{ migrateLegacyRecordingsToDataAssets }, { db }] = await Promise.all([
      import('../services/data-assets/legacy-recording-migration.js'),
      import('../services/db/index.js'),
    ])
    database = db
    const report = await migrateLegacyRecordingsToDataAssets({ dryRun: options.dryRun })
    stdout.write(JSON.stringify(report, null, 2) + '\n')
    return report.completed ? 0 : 1
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  } finally {
    await database?.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runMigrateLegacyRecordingsCli()
}
