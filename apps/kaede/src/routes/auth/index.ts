import { OpenAPIHono } from '@hono/zod-openapi'
import { registerActivationCompleteRoute } from './activation-complete.js'
import { registerActivationVerifyRoute } from './activation-verify.js'
import { registerChangePasswordRoute } from './change-password.js'
import { registerLoginRoute } from './login.js'
import { registerLogoutRoute } from './logout.js'
import { registerMeRoute } from './me.js'
import { registerGoogleOidcCallbackRoute } from './oidc-google-callback.js'
import { registerGoogleOidcLinkRoute } from './oidc-google-link.js'
import { registerGoogleOidcLoginRoute } from './oidc-google-login.js'

export const authRoutes = new OpenAPIHono()

registerLoginRoute(authRoutes)
registerGoogleOidcLoginRoute(authRoutes)
registerGoogleOidcLinkRoute(authRoutes)
registerGoogleOidcCallbackRoute(authRoutes)
registerActivationVerifyRoute(authRoutes)
registerActivationCompleteRoute(authRoutes)
registerLogoutRoute(authRoutes)
registerMeRoute(authRoutes)
registerChangePasswordRoute(authRoutes)
