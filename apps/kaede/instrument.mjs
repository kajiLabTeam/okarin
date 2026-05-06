import * as Sentry from '@sentry/node'

const parseBoolean = (value, fallback = false) => {
  if (value == null) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') {
    return true
  }

  if (normalized === 'false') {
    return false
  }

  return fallback
}

const parseSampleRate = (value, fallback = 0) => {
  if (value == null || value.trim() === '') {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    return fallback
  }

  return parsed
}

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    sendDefaultPii: parseBoolean(process.env.SENTRY_SEND_DEFAULT_PII, false),
  })
}
