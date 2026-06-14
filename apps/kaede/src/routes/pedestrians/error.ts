import type { CreatePedestrianResult } from '../../usecases/pedestrians/create-pedestrian.js'
import type { GetMyPedestrianResult } from '../../usecases/pedestrians/get-my-pedestrian.js'
import type { ListPedestriansResult } from '../../usecases/pedestrians/list-pedestrians.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type CreatePedestrianError = Extract<CreatePedestrianResult, { ok: false }>['error']
type ListPedestriansError = Extract<ListPedestriansResult, { ok: false }>['error']
type GetMyPedestrianError = Extract<GetMyPedestrianResult, { ok: false }>['error']

export const toCreatePedestrianErrorResponse = (error: CreatePedestrianError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'ORGANIZATION_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'organization not found',
          details: {
            organization_id: error.organizationId,
          },
        },
        status: 404 as const,
      }
  }
}

export const toListPedestriansErrorResponse = (error: ListPedestriansError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
  }
}

export const toGetMyPedestrianErrorResponse = (error: GetMyPedestrianError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'PEDESTRIAN_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'pedestrian not found',
        },
        status: 404 as const,
      }
  }
}
