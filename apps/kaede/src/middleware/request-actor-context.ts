import type { Context } from 'hono'

export interface UserActorMembership {
  organization_id: string
  organization_name: string
  role: 'member' | 'manager'
}

export interface UserRequestActor {
  type: 'user'
  user_id: string
  email: string
  global_role: 'none' | 'admin'
  password_must_change: boolean
  memberships: UserActorMembership[]
}

export interface ServiceClientRequestActor {
  type: 'service_client'
  name: 'shared_token'
}

export type RequestActor = UserRequestActor | ServiceClientRequestActor

export interface RequestActorVariables {
  requestActor?: RequestActor
}

export interface RequestActorHonoEnv {
  Variables: RequestActorVariables
}

type RequestActorContext = Context<RequestActorHonoEnv>

const requestActorKey = 'requestActor' satisfies keyof RequestActorVariables

export const setRequestActor = (c: RequestActorContext, actor: RequestActor) => {
  c.set(requestActorKey, actor)
}

export const getRequestActor = (c: RequestActorContext): RequestActor | undefined => {
  return c.get(requestActorKey)
}

export const requireRequestActor = (c: RequestActorContext): RequestActor => {
  const actor = getRequestActor(c)

  if (!actor) {
    throw new Error('request actor is not set')
  }

  return actor
}
