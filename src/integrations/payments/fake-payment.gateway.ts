import type { InitializedPayment, PaymentGateway, PaymentWebhookEvent, RefundResult, VerifiedPayment } from './payment-gateway'
import { AppError } from '../../shared/errors'

const disabled = (): never => {
    throw new AppError('Payments are disabled in local test mode', 503)
}

export const fakePaymentGateway: PaymentGateway = {
    async initializePayment(input): Promise<InitializedPayment> {
        return {
            authorizationUrl: null,
            reference: input.reference,
            mode: 'disabled',
        }
    },
    async verifyPayment(): Promise<VerifiedPayment> {
        return disabled()
    },
    async refundPayment(): Promise<RefundResult> {
        return disabled()
    },
    async parseWebhook(): Promise<PaymentWebhookEvent> {
        return disabled()
    },
}
