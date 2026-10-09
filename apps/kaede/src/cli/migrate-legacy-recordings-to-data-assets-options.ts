export interface MigrateLegacyRecordingsCliOptions {
  dryRun: boolean
  help: boolean
}

export const parseMigrateLegacyRecordingsCliArgs = (
  args: readonly string[]
): MigrateLegacyRecordingsCliOptions | { error: string } => {
  let dryRun = true
  let help = false

  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--execute') dryRun = false
    else if (arg === '-h' || arg === '--help') help = true
    else return { error: `unknown option: ${arg}` }
  }

  return { dryRun, help }
}
