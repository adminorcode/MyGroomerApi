import { isLocalTestMode } from '../../config/runtime.config'
import { fakePaymentGateway } from './fake-payment.gateway'
import { paystackPaymentGateway } from './paystack-payment.gateway'

export type InitializePaymentInput = {
    email: string
    amountMinor: number
    reference: string
    callbackUrl?: string
}

export type InitializedPayment = {
    authorizationUrl: string | null
    reference: string
    mode: 'live' | 'disabled'
}

export type VerifiedPayment = {
    status: string
}

export type RefundResult = {
    accepted: boolean
}

export type PaymentWebhookEvent =
    | { type: 'charge.success'; reference: string }
    | { type: 'charge.failed'; reference: string }
    | { type: 'refund.processed'; reference?: string }
    | { type: 'ignored' }

export interface PaymentGateway {
    initializePayment(input: InitializePaymentInput): Promise<InitializedPayment>
    verifyPayment(reference: string): Promise<VerifiedPayment>
    refundPayment(reference: string, amountMinor: number): Promise<RefundResult>
    parseWebhook(rawBody: Buffer, signature: string | undefined): Promise<PaymentWebhookEvent>
}

export const getPaymentGateway = (): PaymentGateway =>
    isLocalTestMode() ? fakePaymentGateway : paystackPaymentGateway
