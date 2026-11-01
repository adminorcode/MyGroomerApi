import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { createReviewForCustomer, getReviewByIdForActor, listReviewsForActor } from './review.service'

export const createReview = async (req: Request, res: Response) => {
    if (!req.user?.id) throw new AppError('Não autorizado', 401)
    const review = await createReviewForCustomer(req.user.id, req.body)
    res.status(201).json({ success: true, message: 'Avaliação criada com sucesso', data: review })
}

export const getReviews = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const query = req.query as { limit?: number, page?: number, customerId?: string, providerId?: string }
    const reviews = await listReviewsForActor(req.user, {
        limit: query.limit,
        page: query.page,
        customerId: query.customerId,
        providerId: query.providerId,
    })
    res.status(200).json({ success: true, message: 'Avaliações carregadas', data: reviews })
}

export const getReviewById = async (req: Request, res: Response) => {
    const review = await getReviewByIdForActor(req.params.reviewId as string)
    if (!review) {
        res.status(404).json({ message: 'Avaliação não encontrada' })
        return
    }
    res.status(200).json({ message: 'Avaliação carregada', data: review })
}
