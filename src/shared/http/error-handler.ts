import { NextFunction, Request, Response } from 'express'
import { logger } from '../../config/logger.config'
import { AppError } from '../errors'

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(err.message, { stack: err.stack })
    if ('type' in err && err.type === 'entity.too.large') {
        res.status(413).json({ message: 'Os anexos excedem o limite de envio. Use até 5 arquivos de no máximo 10 MB cada.' })
    } else if ('type' in err && err.type === 'entity.parse.failed') {
        res.status(400).json({ message: 'O conteúdo enviado é inválido.' })
    } else if (err instanceof AppError) {
        res.status(err.statusCode).json({
            message: err.message,
        })
    } else {
        res.status(500).json({
            message: 'Something unexpected happened.',
        })
    }
}
