import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { getAppRuntimeConfig } from '../../config/runtime.js'

export const sessionCookieName = 'okarin_session'

export const getSessionTokenFromCookie = (c: Context): string | undefined => {
  return getCookie(c, sessionCookieName)
}

export const setSessionCookie = (c: Context, token: string) => {
  const runtimeConfig = getAppRuntimeConfig()

  setCookie(c, sessionCookieName, token, {
    httpOnly: true,
    path: '/',
    sameSite: runtimeConfig.sessionCookieSameSite,
    secure: runtimeConfig.env !== 'local',
  })
}

export const clearSessionCookie = (c: Context) => {
  deleteCookie(c, sessionCookieName, {
    path: '/',
  })
}
