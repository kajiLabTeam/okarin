import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRequestActor } from '../../middleware/request-actor-context.js'
import { NozomiPipelineError } from '../../services/nozomi/pipeline-client.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerPipelineAvailabilityRoute } from './pipeline-availability.js'

const { listAvailabilityMock, findRecordingMock, findRecordingAuthorizationMock } = vi.hoisted(
  () => ({
    listAvailabilityMock: vi.fn(),
    findRecordingMock: vi.fn(),
    findRecordingAuthorizationMock: vi.fn(),
  })
)

vi.mock('../../services/nozomi/pipeline-availability.js', () => ({
  listPipelineAvailability: listAvailabilityMock,
}))
vi.mock('../../services/recordings/index.js', () => ({
  findRecordingByIdForOrganization: findRecordingMock,
  findRecordingAuthorizationByIdForOrganization: findRecordingAuthorizationMock,
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const recordingId = '22222222-2222-4222-8222-222222222222'

const actor = (role: 'member' | 'manager' = 'manager'): UserRequestActor => ({
  type: 'user',
  user_id: '33333333-3333-4333-8333-333333333333',
  email: 'user@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Lab', role }],
})

describe('GET /api/organizations/:organizationId/pipeline-availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findRecordingMock.mockResolvedValue({ id: recordingId })
    findRecordingAuthorizationMock.mockResolvedValue({
      organization_id: organizationId,
      pedestrian_user_id: null,
    })
    listAvailabilityMock.mockResolvedValue({ pipelines: [] })
  })

  it('権限のある利用者へ指定recordingの利用可否を返す', async () => {
    const app = createRouteTestApp('/organizations', registerPipelineAvailabilityRoute, {
      actor: actor(),
    })

    const response = await app.request(
      `/api/organizations/${organizationId}/pipeline-availability?recording_ids=${recordingId}`
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ pipelines: [] })
    expect(listAvailabilityMock).toHaveBeenCalledWith([recordingId])
  })

  it('organization外のrecordingを404にしてcatalogを取得しない', async () => {
    findRecordingMock.mockResolvedValue(null)
    const app = createRouteTestApp('/organizations', registerPipelineAvailabilityRoute, {
      actor: actor(),
    })

    const response = await app.request(
      `/api/organizations/${organizationId}/pipeline-availability?recording_ids=${recordingId}`
    )

    expect(response.status).toBe(404)
    expect(listAvailabilityMock).not.toHaveBeenCalled()
  })

  it('recordingを閲覧できないmemberを403にする', async () => {
    const app = createRouteTestApp('/organizations', registerPipelineAvailabilityRoute, {
      actor: actor('member'),
    })

    const response = await app.request(
      `/api/organizations/${organizationId}/pipeline-availability?recording_ids=${recordingId}`
    )

    expect(response.status).toBe(403)
    expect(listAvailabilityMock).not.toHaveBeenCalled()
  })

  it('UUID不正と重複IDを400にする', async () => {
    const app = createRouteTestApp('/organizations', registerPipelineAvailabilityRoute, {
      actor: actor(),
    })

    const invalid = await app.request(
      `/api/organizations/${organizationId}/pipeline-availability?recording_ids=invalid`
    )
    const duplicate = await app.request(
      `/api/organizations/${organizationId}/pipeline-availability?recording_ids=${recordingId},${recordingId}`
    )

    expect(invalid.status).toBe(400)
    expect(duplicate.status).toBe(400)
    expect(findRecordingMock).not.toHaveBeenCalled()
  })

  it('Nozomi障害だけを502へ変換する', async () => {
    listAvailabilityMock.mockRejectedValue(new NozomiPipelineError('NOZOMI_UNAVAILABLE', 'timeout'))
    const app = createRouteTestApp('/organizations', registerPipelineAvailabilityRoute, {
      actor: actor(),
    })

    const response = await app.request(
      `/api/organizations/${organizationId}/pipeline-availability?recording_ids=${recordingId}`
    )

    expect(response.status).toBe(502)
  })

  it('DB等の内部障害をNozomi障害として偽装しない', async () => {
    listAvailabilityMock.mockRejectedValue(new Error('database failed'))
    const app = createRouteTestApp('/organizations', registerPipelineAvailabilityRoute, {
      actor: actor(),
    })

    const response = await app.request(
      `/api/organizations/${organizationId}/pipeline-availability?recording_ids=${recordingId}`
    )

    expect(response.status).toBe(500)
  })
})
