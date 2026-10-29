import { logger } from '../../config/logger.config'
import { AppError } from '../../shared/errors'
import { withTransaction } from '../../shared/db/transaction'
import { BookingStatus } from '../booking/booking.types'
import { PaymentStatus } from './payment.types'
import { lockBookingStatus, markAwaitingConfirmation } from '../booking/booking.service'
import { applyPaymentStatus, lockPaymentByReference, withPaymentLock } from './payment.service'

export type ConfirmChargeOptions = {
    afterPaymentUpdate?: () => Promise<void>
}

export const confirmSuccessfulCharge = async (reference: string, options: ConfirmChargeOptions = {}) => {
    let confirmed = false
    await withPaymentLock(reference, async () => {
        await withTransaction(async (client) => {
            const current = await lockPaymentByReference(reference, client)
            if (!current) throw new AppError('No payment with this reference', 404)
            if (current.payment_status === PaymentStatus.SUCCESS) return
            if (current.payment_status !== PaymentStatus.PENDING && current.payment_status !== PaymentStatus.FAILED) return
            const bookingStatus = await lockBookingStatus(current.booking_id, client)
            if (!bookingStatus) throw new AppError('Agendamento não encontrado ou a atualização falhou', 404)
            if (bookingStatus !== BookingStatus.PENDING_PAYMENT) return
            const applied = await applyPaymentStatus(reference, PaymentStatus.SUCCESS, client)
            if (!applied || applied.rejected || applied.alreadyApplied) return
            if (options.afterPaymentUpdate) await options.afterPaymentUpdate()
            const booking = await markAwaitingConfirmation(current.booking_id, client)
            if (!booking) throw new AppError('Agendamento não encontrado ou a atualização falhou', 404)
            confirmed = true
        })
    })
    if (confirmed) {
        logger.info(`Payment status updated to success: ${PaymentStatus.SUCCESS}`)
        logger.info('Booking status updated to pending confirmation: pending_confirmation')
    }
}
