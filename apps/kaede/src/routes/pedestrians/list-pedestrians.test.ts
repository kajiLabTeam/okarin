import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListPedestriansRoute } from './list-pedestrians.js'

const { listPedestriansMock } = vi.hoisted(() => ({
  listPedestriansMock: vi.fn(),
}))

vi.mock('../../usecases/list-pedestrians.js', () => ({
  listPedestrians: listPedestriansMock,
}))

describe('GET /api/pedestrians', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pedestrian 一覧を返す', async () => {
    listPedestriansMock.mockResolvedValue({
      pedestrians: [
        {
          pedestrian_id: '11111111-1111-4111-8111-111111111111',
          organization_id: '99999999-9999-4999-8999-999999999999',
          display_name: 'test participant',
          height: 1.72,
          stride_length: 0.7,
          attributes: {
            label: 'test participant',
          },
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })

    const app = createRouteTestApp('/pedestrians', registerListPedestriansRoute)
    const response = await app.request('/api/pedestrians')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pedestrians: [
        {
          pedestrian_id: '11111111-1111-4111-8111-111111111111',
          organization_id: '99999999-9999-4999-8999-999999999999',
          display_name: 'test participant',
          height: 1.72,
          stride_length: 0.7,
          attributes: {
            label: 'test participant',
          },
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })

    expect(listPedestriansMock).toHaveBeenCalledWith()
  })
})
