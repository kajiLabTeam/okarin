import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetRuntimeConfigForTests } from '../../../src/config/runtime.js'
import { createSession } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import {
  approveOrganizationCreationRequestForAdminSession,
  createOrganizationCreationRequestForSession,
  listMyOrganizationCreationRequestsForSession,
  rejectOrganizationCreationRequestForAdminSession,
} from '../../../src/usecases/organizations/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
const now = new Date('2026-06-11T00:00:00.000Z')

const createUserWithSession = async (params: { email: string; globalRole?: 'admin' | 'none' }) => {
  const user = await db
    .insertInto('users')
    .values({
      email: params.email,
      display_name: params.email,
      password_hash: passwordHash,
      global_role: params.globalRole ?? 'none',
      is_active: true,
      password_must_change: false,
      password_changed_at: now,
      temporary_password_expires_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const session = await createSession({ userId: user.id, now }, db)

  return {
    user,
    sessionToken: session.token,
  }
}

describe('organization creation request usecase', () => {
  beforeEach(async () => {
    process.env.ORGANIZATION_CREATION_REQUESTS_ENABLED = 'true'
    resetRuntimeConfigForTests()
    await resetDatabase(db)
  })

  afterAll(async () => {
    Reflect.deleteProperty(process.env, 'ORGANIZATION_CREATION_REQUESTS_ENABLED')
    resetRuntimeConfigForTests()
    await db.destroy()
  })

  it('pending user can create and list their organization creation request', async () => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })

    const result = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      {
        organization_name: ' Example Organization ',
        requested_slug: 'example-org',
      },
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        requester_user_id: requester.user.id,
        requested_organization_name: 'Example Organization',
        requested_slug: 'example-org',
        status: 'pending',
      },
    })

    const listResult = await listMyOrganizationCreationRequestsForSession(
      requester.sessionToken,
      db
    )

    expect(listResult).toMatchObject({
      ok: true,
      value: {
        requests: [
          {
            requester_user_id: requester.user.id,
            status: 'pending',
          },
        ],
      },
    })
  })

  it('active member cannot create organization creation request', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Existing Organization' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const member = await createUserWithSession({ email: 'member@example.com' })
    await db
      .insertInto('organization_memberships')
      .values({
        organization_id: organization.id,
        user_id: member.user.id,
        role: 'member',
      })
      .execute()

    const result = await createOrganizationCreationRequestForSession(
      member.sessionToken,
      {
        organization_name: 'New Organization',
        requested_slug: 'new-org',
      },
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER',
      },
    })
  })

  it('platform admin can approve request and create organization with owner membership', async () => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const created = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      {
        organization_name: 'Example Organization',
        requested_slug: 'example-org',
      },
      db
    )
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const result = await approveOrganizationCreationRequestForAdminSession(
      admin.sessionToken,
      created.value.request_id,
      {
        slug: 'approved-org',
      },
      now,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        request_id: created.value.request_id,
        status: 'approved',
        reviewed_by_user_id: admin.user.id,
        reviewed_at: now.toISOString(),
      },
    })
    if (!result.ok) {
      return
    }
    expect(result.value.created_organization_id).toEqual(expect.any(String))

    const organization = await db
      .selectFrom('organizations')
      .selectAll()
      .where('id', '=', result.value.created_organization_id)
      .executeTakeFirstOrThrow()
    expect(organization).toMatchObject({
      name: 'Example Organization',
      slug: 'approved-org',
    })

    const membership = await db
      .selectFrom('organization_memberships')
      .selectAll()
      .where('organization_id', '=', organization.id)
      .where('user_id', '=', requester.user.id)
      .executeTakeFirstOrThrow()
    expect(membership.role).toBe('owner')
  })

  it('approve rejects duplicate slug', async () => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    await db.insertInto('organizations').values({ name: 'Existing', slug: 'used-slug' }).execute()
    const created = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      {
        organization_name: 'Example Organization',
        requested_slug: 'example-org',
      },
      db
    )
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const result = await approveOrganizationCreationRequestForAdminSession(
      admin.sessionToken,
      created.value.request_id,
      {
        slug: 'used-slug',
      },
      now,
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
      },
    })
  })

  it('platform admin can reject pending request', async () => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const created = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      {
        organization_name: 'Example Organization',
        requested_slug: 'example-org',
      },
      db
    )
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const result = await rejectOrganizationCreationRequestForAdminSession(
      admin.sessionToken,
      created.value.request_id,
      {
        reason: 'not enough detail',
      },
      now,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'rejected',
        rejected_reason: 'not enough detail',
        reviewed_by_user_id: admin.user.id,
      },
    })
  })
})
