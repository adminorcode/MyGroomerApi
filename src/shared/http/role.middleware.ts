import { NextFunction, Request, Response } from 'express'
import { Role } from '../../modules/auth/user.types'
import { AppError } from '../errors'

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = req.user

    if (!user) {
        throw new AppError('User not found', 401)
    }

    if (user.role !== Role.ADMIN) {
        throw new AppError('Unauthorized', 401)
    }

    next()
}
