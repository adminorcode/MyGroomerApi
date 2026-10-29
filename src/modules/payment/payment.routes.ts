import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { validate } from '../../shared/http/validate.middleware'
import { initializePayment, webhookHandler } from './payment.controller'
import { initializePaymentSchema } from './payment.schemas'

const router = Router()

router.post('/initialize', authenticate, validate(initializePaymentSchema), initializePayment)
router.post('/webhook', webhookHandler)

export default router
