import { logger } from '../../config/logger.config'
import { assertPaymentsEnabled } from '../../config/runtime.config'
import { getPaymentGateway } from '../../integrations/payments/payment-gateway'
import { AppError } from '../../shared/errors'
import { withTransaction } from '../../shared/db/transaction'
import { PaymentStatus } from './payment.types'
import { confirmSuccessfulCharge } from './confirm-charge.service'
import { applyPaymentStatus, withPaymentLock } from './payment.service'

export const handlePaymentWebhook = async (rawBody: Buffer, signature: string | undefined) => {
    assertPaymentsEnabled()
    const event = await getPaymentGateway().parseWebhook(rawBody, signature)

    if (event.type === 'charge.success') {
        const verified = await getPaymentGateway().verifyPayment(event.reference)
        if (verified.status !== 'success') throw new AppError('Payment verification failed', 400)
        await confirmSuccessfulCharge(event.reference)
    }

    if (event.type === 'charge.failed') {
        await markChargeFailed(event.reference)
    }

    if (event.type === 'refund.processed') {
        logger.info('Refund processed', { transaction_reference: event.reference })
    }
}

export const markChargeFailed = async (reference: string) => {
    await withPaymentLock(reference, async () => {
        await withTransaction(async (client) => {
            await applyPaymentStatus(reference, PaymentStatus.FAILED, client)
        })
    })
}
