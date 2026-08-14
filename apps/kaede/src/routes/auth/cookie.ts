import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { getAppRuntimeConfig } from '../../config/runtime.js'

export const sessionCookieName = 'okarin_session'

export const getSessionTokenFromCookie = (c: Context): string | undefined => {
  return getCookie(c, sessionCookieName)
}

export const setSessionCookie = (c: Context, token: string, expiresAt?: Date | string) => {
  const runtimeConfig = getAppRuntimeConfig()
  const expires = expiresAt ? new Date(expiresAt) : undefined
  const maxAge = expires
    ? Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000))
    : undefined

  setCookie(c, sessionCookieName, token, {
    httpOnly: true,
    path: '/',
    sameSite: runtimeConfig.sessionCookieSameSite,
    secure: runtimeConfig.env !== 'local',
    ...(maxAge !== undefined ? { maxAge } : {}),
  })
}

export const clearSessionCookie = (c: Context) => {
  deleteCookie(c, sessionCookieName, {
    path: '/',
  })
}
