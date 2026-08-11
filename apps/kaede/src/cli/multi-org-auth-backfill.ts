interface Options {
  batchSize: number
  command: 'cutover' | 'preflight' | 'backfill-core' | 'backfill-auth' | 'verify' | 'validate'
}

const usage = (): never => {
  throw new Error(
    'usage: multi-org-auth-backfill <cutover|preflight|backfill-core|backfill-auth|verify|validate> [--batch-size POSITIVE_INTEGER]'
  )
}

export const parseOptions = (argv: string[]): Options => {
  const command = argv.shift()
  if (
    command !== 'cutover' &&
    command !== 'preflight' &&
    command !== 'backfill-core' &&
    command !== 'backfill-auth' &&
    command !== 'verify' &&
    command !== 'validate'
  ) {
    usage()
  }

  let batchSize = 500
  while (argv.length > 0) {
    const flag = argv.shift()
    if (flag !== '--batch-size') usage()
    const value = argv.shift() ?? usage()
    batchSize = Number(value)
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0 || batchSize > 10_000) usage()
  }

  return { batchSize, command: command as Options['command'] }
}

export const main = async (argv = process.argv.slice(2)) => {
  const options = parseOptions([...argv])
  const {
    backfillMultiOrgAuthCore,
    backfillMultiOrgAuthCredentials,
    executeOneShotMultiOrgAuthCutover,
    getMultiOrgAuthPreflightReport,
    validateMultiOrgAuthExpandConstraints,
    verifyMultiOrgAuthCoreBackfill,
  } = await import('../services/migrations/multi-org-auth-backfill.js')

  if (options.command === 'cutover') {
    const { getOidcRuntimeConfig } = await import('../config/runtime.js')
    const config = getOidcRuntimeConfig()
    const result = await executeOneShotMultiOrgAuthCutover(options.batchSize, undefined, {
      google_client_id: config.googleClientId,
      local_auth_enabled: config.passwordLoginEnabled,
      oidc_auth_enabled: config.enabled,
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }

  if (options.command === 'preflight') {
    const report = await getMultiOrgAuthPreflightReport()
    process.stdout.write(`${JSON.stringify(report)}\n`)
    if (report.blocking) throw new Error('multi-organization auth preflight has blocking issues')
    return
  }

  if (options.command === 'backfill-core') {
    const result = await backfillMultiOrgAuthCore(options.batchSize)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }

  if (options.command === 'backfill-auth') {
    const result = await backfillMultiOrgAuthCredentials(options.batchSize)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }

  if (options.command === 'verify') {
    const result = await verifyMultiOrgAuthCoreBackfill()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (Object.values(result).some((count) => count > 0)) {
      throw new Error('multi-organization auth core backfill is incomplete')
    }
    return
  }

  await validateMultiOrgAuthExpandConstraints()
  process.stdout.write(`${JSON.stringify({ validated: true })}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
