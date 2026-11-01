import axios from 'axios'
import { assertPaymentsEnabled } from '../../config/runtime.config'
import { logger } from '../../config/logger.config'
import type { InitiateTransfer, PayoutGateway, TransferRecipient } from './payout-gateway'

const paystackHeaders = () => ({
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
})

export const createPaystackTransferRecipient = async (recipient: TransferRecipient): Promise<string> => {
    assertPaymentsEnabled()
    try {
        const transfer = await axios.post(
            'https://api.paystack.co/transferrecipient',
            {
                type: recipient.type,
                name: recipient.name,
                account_number: recipient.account_number,
                bank_code: recipient.bank_code,
                currency: recipient.currency,
            },
            { headers: paystackHeaders() },
        )
        return transfer.data.data.recipient_code
    } catch (error) {
        logger.error('createPaystackTransferRecipient error', { error })
        throw error
    }
}

export const initiatePaystackTransfer = async (transfer: InitiateTransfer) => {
    assertPaymentsEnabled()
    try {
        const result = await axios.post(
            'https://api.paystack.co/transfer',
            {
                source: transfer.source,
                amount: transfer.amount,
                recipient: transfer.recipient,
                reason: transfer.reason,
            },
            { headers: paystackHeaders() },
        )
        return result.data
    } catch (error) {
        logger.error('initiatePaystackTransfer error', { error })
        throw error
    }
}

export const paystackPayoutGateway: PayoutGateway = {
    createTransferRecipient: createPaystackTransferRecipient,
    initiateTransfer: initiatePaystackTransfer,
}
