import { OpenAPIHono } from '@hono/zod-openapi'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { registerUserProfileRoutes } from './profile.js'

export const usersRoutes = new OpenAPIHono<RequestActorHonoEnv>()

registerUserProfileRoutes(usersRoutes)
