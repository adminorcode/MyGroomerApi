import type { InitiateTransfer, PayoutGateway, TransferRecipient } from './payout-gateway'

export const fakePayoutGateway: PayoutGateway = {
    async createTransferRecipient(_recipient: TransferRecipient) {
        return 'local-test-recipient'
    },
    async initiateTransfer(_transfer: InitiateTransfer) {
        return { status: 'disabled' }
    },
}
