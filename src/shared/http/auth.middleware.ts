import { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../auth/jwt'
import { AppError } from '../errors'

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization

    if (!token || !token.startsWith('Bearer ')) {
        throw new AppError('Token inválido', 401)
    }

    const parsedToken = token.split(' ')[1]

    try {
        req.user = verifyToken(parsedToken)
        next()
    } catch {
        res.status(401).json({ message: 'Token inválido' })
    }
}
