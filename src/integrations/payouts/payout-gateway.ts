import { isLocalTestMode } from '../../config/runtime.config'
import { fakePayoutGateway } from './fake-payout.gateway'
import { paystackPayoutGateway } from './paystack-payout.gateway'

export type TransferRecipient = {
    type: 'mobile_money' | 'ghipss'
    name: string
    account_number: string
    bank_code: string
    currency: 'GHS'
}

export type InitiateTransfer = {
    source: 'balance'
    amount: number
    recipient: string
    reason: string
}

export interface PayoutGateway {
    createTransferRecipient(recipient: TransferRecipient): Promise<string>
    initiateTransfer(transfer: InitiateTransfer): Promise<unknown>
}

export const getPayoutGateway = (): PayoutGateway =>
    isLocalTestMode() ? fakePayoutGateway : paystackPayoutGateway
