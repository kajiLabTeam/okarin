import { pathToFileURL } from 'node:url'

export const runInitializeApprovedOrganizationOidc = async (args = process.argv.slice(2)) => {
  const usage =
    'Usage: pnpm initialize:organization-oidc <organization-slug> [--execute]\nDefault: dry run; only approved organizations with untouched auth settings are eligible.\n'
  if (args.includes('--help')) {
    process.stdout.write(usage)
    return 0
  }
  const slug = args.at(0)
  const mode = args.at(1)
  const dryRun = mode !== '--execute'
  if (
    !slug ||
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ||
    args.length > 2 ||
    (mode !== undefined && mode !== '--execute')
  ) {
    process.stderr.write(usage)
    return 1
  }
  const { db } = await import('../services/db/index.js')
  try {
    const { initializeOwnerOidc } =
      await import('../services/organizations/initialize-owner-oidc.js')
    const result = await db.transaction().execute(async (trx) => {
      const request = await trx
        .selectFrom('organization_creation_requests as request')
        .innerJoin(
          'organizations as organization',
          'organization.id',
          'request.created_organization_id'
        )
        .select(['organization.id', 'request.requester_user_id', 'request.reviewed_by_user_id'])
        .where('organization.slug', '=', slug)
        .where('organization.status', '=', 'active')
        .where('request.status', '=', 'approved')
        .executeTakeFirst()
      if (!request?.reviewed_by_user_id)
        throw new Error('Active organization with an approved creation request not found')
      return initializeOwnerOidc(request.id, request.requester_user_id, null, trx, dryRun)
    })
    process.stdout.write(
      JSON.stringify({ organization_slug: slug, dry_run: dryRun, ...result }) + '\n'
    )
    return result.status === 'skipped' ? 1 : 0
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  } finally {
    await db.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runInitializeApprovedOrganizationOidc()
}
