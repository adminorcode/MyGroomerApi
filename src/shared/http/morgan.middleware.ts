import { Request } from 'express'
import morgan from 'morgan'
import { logger } from '../../config/logger.config'

const stream = {
    write: (message: string) => {
        logger.http(message.trim())
    },
}

const skip = (req: Request) => req.path === '/health'

export const morganMiddleware = morgan(
    ':remote-addr :method :url :status :res[content-length] - :response-time ms :user-agent',
    { stream, skip },
)
