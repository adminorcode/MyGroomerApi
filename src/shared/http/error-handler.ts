import { NextFunction, Request, Response } from 'express'
import { logger } from '../../config/logger.config'
import { AppError } from '../errors'

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(err.message, { stack: err.stack })
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            message: err.message,
        })
    } else {
        res.status(500).json({
            message: 'Something unexpected happened.',
        })
    }
}
