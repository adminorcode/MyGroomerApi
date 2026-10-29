import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { createReviewForCustomer, getReviewByIdForActor, listReviewsForActor } from './review.service'

export const createReview = async (req: Request, res: Response) => {
    if (!req.user?.id) throw new AppError('Unauthenticated', 401)
    const review = await createReviewForCustomer(req.user.id, req.body)
    res.status(201).json({ success: true, message: 'Review created successfully!', data: review })
}

export const getReviews = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthenticated', 401)
    const reviews = await listReviewsForActor(req.user, {
        limit: parseInt(req.query.limit as string, 10),
        page: parseInt(req.query.page as string, 10),
        customerId: req.query.customerId as string | undefined,
        providerId: req.query.providerId as string | undefined,
    })
    res.status(200).json({ success: true, message: 'Fetched reviews successfully', data: reviews })
}

export const getReviewById = async (req: Request, res: Response) => {
    const { reviewId } = req.params
    if (!reviewId || typeof reviewId !== 'string') {
        res.status(400).json({ message: 'Invalid review id' })
        return
    }
    const review = await getReviewByIdForActor(reviewId)
    if (!review) {
        res.status(404).json({ message: 'Review for booking not found' })
        return
    }
    res.status(200).json({ message: 'Review retrieved successfully', data: review })
}
