import { Router } from 'express'
import authRouter from './auth.routes'
import categoryRouter from './category.routes'
import serviceRouter from './service.routes'
import providerServiceRouter from './provider.routes'
import bookingRouter from './booking.routes'
import paymentRouter from './payment.routes'
import reviewRouter from './review.routes'
import conversationRouter from './conversation.routes'
import petRouter from './pet.routes'


const router = Router()
router.use('/auth', authRouter)
router.use('/categories', categoryRouter)
router.use('/services', serviceRouter)
router.use('/providers', providerServiceRouter)
router.use('/bookings', bookingRouter)
router.use('/payments', paymentRouter)
router.use('/reviews', reviewRouter)
router.use('/conversations', conversationRouter)
router.use('/pets', petRouter)

export default router