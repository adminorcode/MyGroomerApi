import 'dotenv/config'
import { AppError } from '../middlewares/errorHandler'

export const isLocalTestMode = (): boolean => {
    const enabled = process.env.LOCAL_TEST_MODE === 'true'
    if (enabled && !['development', 'test'].includes(process.env.NODE_ENV ?? '')) {
        throw new Error('LOCAL_TEST_MODE requires NODE_ENV=development or test')
    }
    return enabled
}

export const isGoogleAuthEnabled = (): boolean => !isLocalTestMode() && Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL
)

export const assertPaymentsEnabled = (): void => {
    if (isLocalTestMode()) {
        throw new AppError('Payments are disabled in local test mode', 503)
    }
}

export const validateRuntime = (): void => {
    isLocalTestMode()
    if (isLocalTestMode()) assertLocalTestDatabase()
    for (const name of ['DATABASE_URL', 'REDIS_URL', 'RABBITMQ_URL', 'JWT_SECRET']) {
        if (!process.env[name]?.trim()) throw new Error(`Missing required configuration: ${name}`)
    }
    if (process.env.JWT_SECRET!.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters')
    if (!isLocalTestMode() && !isGoogleAuthEnabled()) {
        throw new Error('Configure Google OAuth or enable LOCAL_TEST_MODE for local development')
    }
}

export const assertLocalTestDatabase = (): void => {
    if (!isLocalTestMode()) throw new Error('Demo data requires LOCAL_TEST_MODE=true')
    const database = new URL(process.env.DATABASE_URL ?? '')
    if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) || database.pathname !== '/mygroomer_dev') {
        throw new Error('Demo data is restricted to the local mygroomer_dev database')
    }
}
