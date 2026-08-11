import { z } from '@hono/zod-openapi'
import { uuidSchema } from './common.js'

export const organizationSessionLogoutParamsSchema = z
  .object({ organizationId: uuidSchema })
  .openapi('OrganizationSessionLogoutParams')

export const organizationSessionLogoutResponseSchema = z
  .object({
    organization_id: uuidSchema,
    membership_id: uuidSchema,
    revoked: z.boolean(),
  })
  .openapi('OrganizationSessionLogoutResponse')
