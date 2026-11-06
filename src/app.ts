import express from "express"
import cors from 'cors'
import helmet from 'helmet'
import { errorHandler } from "./shared/http/error-handler"
import appRoutes from './routes/index'
import passport from "passport"
import './integrations/google/passport'
import { generalLimiter } from "./config/rateLimit.config"
import { morganMiddleware } from "./shared/http/morgan.middleware"
import { isGoogleAuthEnabled, isLocalTestMode, localDatabaseName } from './config/runtime.config'



export const createApp = () => {
    const app = express()
    
    app.set('trust proxy', 1) // this helps morgan's ':remote-addr' format show real client IP even behind proxy like Nginx or Cloudflare
    
    app.use(
        '/api/v1/payments/webhook',
        express.raw({ type: 'application/json' })
    )
    const defaultJson = express.json()
    // Evidence payloads are parsed only after route authentication/rate limiting.
    app.use((req, res, next) => {
        const registration = (req.method === 'POST' && req.path === '/api/v1/auth/register') ||
            (req.method === 'PUT' && req.path === '/api/v1/providers/registration')
        const publicPhoto = (req.method === 'PUT' && req.path === '/api/v1/providers/me/photo') ||
            (req.method === 'POST' && req.path === '/api/v1/providers/me/gallery')
        if (registration || publicPhoto) next()
        else defaultJson(req, res, next)
    })
    app.use(cors())
    app.use(helmet())

    app.use(generalLimiter)
    app.use(morganMiddleware)

    app.use(passport.initialize())

    app.get('/health' ,(req, res)=> {
        res.send('Ok')
    })

    app.get('/api/v1/runtime', (_req, res) => {
        const localTest = isLocalTestMode()
        res.json({ success: true, data: {
            localTest,
            googleAuthEnabled: isGoogleAuthEnabled(),
            paymentsEnabled: !localTest,
            ...(localTest ? { databaseName: localDatabaseName() } : {})
        } })
    })

    app.use('/api/v1', appRoutes)
    
    app.use(errorHandler)
    return app
}
