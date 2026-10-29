import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { validate } from '../../shared/http/validate.middleware'
import { createReview, getReviewById, getReviews } from './review.controller'
import { createReviewSchema } from './review.schemas'

const router = Router()

router.post('/', authenticate, validate(createReviewSchema), createReview)
router.get('/', authenticate, getReviews)
router.get('/:reviewId', authenticate, getReviewById)

export default router
