import { assertPaymentsEnabled } from '../../config/runtime.config'
import { getPaymentGateway } from '../../integrations/payments/payment-gateway'
import { AppError } from '../../shared/errors'
import { Role } from '../auth/user.types'
import { assertBookingParticipant, findBookingById } from '../booking/booking.service'
import { findPaymentByBookingId, recordPayment } from './payment.service'

type PaymentActor = {
    id: string
    role: Role
    email?: string
}

export const initializePaymentForBooking = async (actor: PaymentActor | undefined, bookingId: string | undefined) => {
    assertPaymentsEnabled()
    if (!actor) throw new AppError('Não autorizado', 401)
    if (!bookingId) throw new AppError('Missing booking id', 400)

    const result = await findBookingById(bookingId)
    if (!result) throw new AppError('No payment with this booking_id exists!', 404)
    if (!result.customer_id) throw new AppError('Missing required fields: customer_email, customer_id, price', 400)
    await assertBookingParticipant(actor, bookingId, result.customer_id)
    if (!result.customer_email || !result.price) {
        throw new AppError('Missing required fields: customer_email, customer_id, price', 400)
    }

    const existingPayment = await findPaymentByBookingId(bookingId)
    if (existingPayment) return { kind: 'existing' as const, payment: existingPayment }

    const price = Number(result.price)
    const reference = `boame_${bookingId}_${Date.now()}`
    const initialized = await getPaymentGateway().initializePayment({
        email: result.customer_email,
        amountMinor: Math.round(price * 100),
        reference,
        callbackUrl: 'https://boame.app/payment/callback',
    })
    await recordPayment({
        customer_id: result.customer_id,
        booking_id: bookingId,
        amount: price,
        payment_date: new Date(),
        paystack_reference: reference,
    })

    return { kind: 'created' as const, authorizationUrl: initialized.authorizationUrl }
}
