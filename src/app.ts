import express from "express"
import cors from 'cors'
import helmet from 'helmet'
import { errorHandler } from "./shared/http/error-handler"
import appRoutes from './routes/index'
import passport from "passport"
import './integrations/google/passport'
import { generalLimiter } from "./config/rateLimit.config"
import { morganMiddleware } from "./shared/http/morgan.middleware"
import { isGoogleAuthEnabled, isLocalTestMode } from './config/runtime.config'



export const createApp = () => {
    const app = express()
    
    app.set('trust proxy', 1) // this helps morgan's ':remote-addr' format show real client IP even behind proxy like Nginx or Cloudflare
    
    app.use(
        '/api/v1/payments/webhook',
        express.raw({ type: 'application/json' })
    )
    app.use(express.json())
    app.use(cors())
    app.use(helmet())

    app.use(generalLimiter)
    app.use(morganMiddleware)

    app.use(passport.initialize())

    app.get('/health' ,(req, res)=> {
        res.send('Ok')
    })

    app.get('/api/v1/runtime', (_req, res) => {
        res.json({ success: true, data: {
            localTest: isLocalTestMode(),
            googleAuthEnabled: isGoogleAuthEnabled(),
            paymentsEnabled: !isLocalTestMode()
        } })
    })

    app.use('/api/v1', appRoutes)
    
    app.use(errorHandler)
    return app
}
