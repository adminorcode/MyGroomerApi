import 'dotenv/config'

export const APP_NAME_DEFAULT = 'Tio de Pet'
export const APP_SCHEME_DEFAULT = 'tiodepet'

export const appName = process.env.APP_NAME?.trim() || APP_NAME_DEFAULT
export const appScheme = normalizeScheme(process.env.APP_SCHEME)
export const paymentReferencePrefix = process.env.APP_REFERENCE_PREFIX?.trim() || appScheme
export const appServiceName = process.env.APP_SERVICE_NAME?.trim() || `${slug(appName)}-api`

function normalizeScheme(value: string | undefined): string {
  const scheme = (value?.trim() || APP_SCHEME_DEFAULT).replace(/:\/\/$/, '')
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    throw new Error('APP_SCHEME must be a lowercase URI scheme')
  }
  return scheme
}

function slug(value: string): string {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'
}

export const appDeepLink = (path: string): string => `${appScheme}://${path.replace(/^\//, '')}`

export const paymentCallbackUrl = (): string => {
  const configured = process.env.PAYMENT_CALLBACK_URL?.trim()
  if (configured) return configured
  const client = (process.env.CLIENT_URL?.trim() || 'http://localhost:8081').replace(/\/$/, '')
  return `${client}/payment/callback`
}

export const paymentReference = (bookingId: string): string =>
  `${paymentReferencePrefix}_${bookingId}_${Date.now()}`
