import axios from 'axios'
import { createHmac, timingSafeEqual } from 'crypto'
import { assertPaymentsEnabled } from '../../config/runtime.config'
import { logger } from '../../config/logger.config'
import { AppError } from '../../shared/errors'
import type { PaymentGateway, PaymentWebhookEvent } from './payment-gateway'

const paystackHeaders = () => ({
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
})

export const paystackPaymentGateway: PaymentGateway = {
    async initializePayment(input) {
        assertPaymentsEnabled()
        const initialize = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email: input.email,
                amount: input.amountMinor,
                reference: input.reference,
                callback_url: input.callbackUrl,
            },
            { headers: paystackHeaders() },
        )
        const authorizationUrl = initialize.data?.data?.authorization_url
        if (!authorizationUrl) throw new AppError('Payment initialization failed!', 500)
        return { authorizationUrl, reference: input.reference, mode: 'live' }
    },

    async verifyPayment(reference) {
        assertPaymentsEnabled()
        const verify = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            { headers: paystackHeaders() },
        )
        return { status: verify.data?.data?.status ?? '' }
    },

    async refundPayment(reference, amountMinor) {
        assertPaymentsEnabled()
        try {
            const refund = await axios.post(
                'https://api.paystack.co/refund',
                { transaction: reference, amount: amountMinor },
                { headers: paystackHeaders() },
            )
            return { accepted: Boolean(refund.data) }
        } catch (error) {
            logger.error('refundPaystackPayment error', { error })
            throw error
        }
    },

    async parseWebhook(rawBody, signature) {
        const hash = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
            .update(rawBody)
            .digest('hex')
        const provided = signature ?? ''
        const expectedBuffer = Buffer.from(hash)
        const providedBuffer = Buffer.from(provided)
        if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
            throw new AppError('Invalid signature', 401)
        }

        const body = JSON.parse(rawBody.toString()) as {
            event?: string
            data?: { reference?: string; transaction_reference?: string }
        }
        const event = body.event
        if (event === 'charge.success') {
            if (!body.data?.reference) throw new AppError('Payment verification failed', 400)
            return { type: 'charge.success', reference: body.data.reference }
        }
        if (event === 'charge.failed' && body.data?.reference) {
            return { type: 'charge.failed', reference: body.data.reference }
        }
        if (event === 'refund.processed') {
            return { type: 'refund.processed', reference: body.data?.transaction_reference }
        }
        return { type: 'ignored' } satisfies PaymentWebhookEvent
    },
}
