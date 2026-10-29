import { Router } from 'express'
import authRouter from '../modules/auth/auth.routes'
import categoryRouter from '../modules/catalog/category.routes'
import serviceRouter from '../modules/catalog/service.routes'
import providerServiceRouter from '../modules/provider/provider.routes'
import bookingRouter from '../modules/booking/booking.routes'
import paymentRouter from '../modules/payment/payment.routes'
import reviewRouter from '../modules/review/review.routes'
import conversationRouter from '../modules/conversation/conversation.routes'
import petRouter from '../modules/pet/pet.routes'


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