import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { validate, validateQuery } from '../../shared/http/validate.middleware'
import { changeBookingStatus, createBooking, getBookingId, getBookings, getBookingSlots } from './booking.controller'
import { bookingSlotsQuerySchema, changeBookingStatusSchema, createBookingSchema } from './booking.schemas'

const router = Router()

router.post('/', authenticate, validate(createBookingSchema), createBooking)
router.get('/slots', authenticate, validateQuery(bookingSlotsQuerySchema), getBookingSlots)
router.get('/:id', authenticate, getBookingId)
router.get('/', authenticate, getBookings)
router.patch('/:id/status', authenticate, validate(changeBookingStatusSchema), changeBookingStatus)

export default router
