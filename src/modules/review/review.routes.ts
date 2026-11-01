import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { validate, validateParams, validateQuery } from '../../shared/http/validate.middleware'
import { createReview, getReviewById, getReviews } from './review.controller'
import { createReviewSchema, listReviewsQuerySchema, reviewIdSchema } from './review.schemas'

const router = Router()

router.post('/', authenticate, validate(createReviewSchema), createReview)
router.get('/', authenticate, validateQuery(listReviewsQuerySchema), getReviews)
router.get('/:reviewId', authenticate, validateParams(reviewIdSchema), getReviewById)

export default router
