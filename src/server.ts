import 'dotenv/config'
import { logger } from './config/logger.config'
import { createApp } from "./app"
import { connectDB } from './config/database.config'
import { initializePassport } from './integrations/google/passport'
import { connectRabbitMQ } from './config/rabbitmq.config'
import { startPayoutCronJob, startPayoutWorker } from './modules/payout/payout.service'
import { createServer } from 'http'
import { initializeSocket } from './config/socket.config'
import { connectRedis } from './config/redis.config'
import { isLocalTestMode, validateRuntime } from './config/runtime.config'

validateRuntime()
initializePassport()

const startServer = async () => {
    const port = process.env.PORT || 3000
    const app = createApp()

    // create HTTP server from Express app
    const httpServer = createServer(app)

    // attach Socket.io to HTTP server
    initializeSocket(httpServer)

    await connectDB()
    await connectRedis()
    await connectRabbitMQ()
    if (!isLocalTestMode()) {
        await startPayoutWorker()
        startPayoutCronJob()
    } else {
        logger.info('Local test mode: email, Google OAuth, payments and payout jobs are disabled')
    }

    httpServer.listen(Number(port), process.env.HOST || (isLocalTestMode() ? '127.0.0.1' : '0.0.0.0'), ()=> {
        logger.info(`Server is running on port ${Number(port)}`)
    })
}

startServer().catch(error => {
    logger.error('Server startup failed', { message: error.message })
    process.exit(1)
})
