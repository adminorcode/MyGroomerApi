import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { Role } from '../auth/user.types'
import { FavoriteProviderBody } from './customer-favorite.schemas'
import { addFavoriteProvider, removeFavoriteProvider } from './customer-favorite.service'

const requireTutor = (req: Request) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    if (req.user.role !== Role.CUSTOMER) throw new AppError('Só o tutor salva favoritos.', 403)
    return req.user
}

export const postFavoriteProvider = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const body = req.body as FavoriteProviderBody
    const data = await addFavoriteProvider(user.id, body.provider_id)
    res.status(200).json({ success: true, data })
}

export const deleteFavoriteProvider = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const data = await removeFavoriteProvider(user.id, req.params.providerId as string)
    res.status(200).json({ success: true, data })
}
