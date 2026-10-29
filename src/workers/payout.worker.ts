import { logger } from "../config/logger.config"
import { getChannel } from "../config/rabbitmq.config"
import { PLATFORM_COMMISSION_RATE } from "../constants"
import { AppError } from "../middlewares/errorHandler"
import { findProviderByUserId } from "../services/provider.service"
import { insertTransaction, updateTransaction } from "../services/transaction.service"
import { findUserById } from "../services/user.service"
import { PayoutJobPayload } from "../types/payout.types"
import { TransactionStatus, TransactionType } from "../types/transaction.types"
import { createPaystackTransferRecipient, initiatePaystackTransfer } from "../utils/paystack.utils"
import { assertPaymentsEnabled } from '../config/runtime.config'


export const startPayoutWorker = async () => {
    assertPaymentsEnabled()
    const channel = getChannel()

    // assert queue exists
    await channel.assertQueue('payout_queue', { durable:true })

    logger.info('Payout worker listening...')

    // consume messages
    channel.consume('payout_queue', async (msg) => {
        if (!msg) return

        try {
            // parse payload
            const payload: PayoutJobPayload = JSON.parse(msg.content.toString())

            const provider = await findProviderByUserId(payload.provider_user_id)
            if (!provider) throw new Error(`Provider not found: ${payload.provider_user_id}`)
            
            // check if provider has payout details
            if (!provider.payout_method) throw new Error('Provider has no payout method')

            const user = await findUserById(provider.user_id)

            // calculate payout after commission
            const commission = payload.amount * PLATFORM_COMMISSION_RATE
            const payoutAmount = payload.amount - commission

            const momoProviderCodeMap: Record<string, string> = {
                'mtn': 'MTN',
                'telecel': 'VOD',
                'airtel_tigo': 'ATL'
            }

            const bank_code = momoProviderCodeMap[provider.momo_provider as string]
            if (!bank_code) throw new Error(`Unknown momo provider: ${provider.momo_provider}`)

            // recipient details based on payout method
            const recipientCode = await createPaystackTransferRecipient({
                type: 'mobile_money',
                name: user?.name ?? 'Provider',
                account_number: provider.momo_number!,
                bank_code: bank_code,
                currency: 'GHS'
            })

            // create a pending transaction
            const transaction = await insertTransaction({
                booking_id: payload.booking_id,
                customer_user_id: payload.customer_id,
                provider_user_id: provider.user_id,
                payment_id: payload.payment_id,
                amount: payoutAmount,
                transaction_type: TransactionType.PAYOUT,
                transaction_status: TransactionStatus.PENDING
            })

            if (!transaction){
                throw new AppError('Error creating transaction for payout', 500)
            }

            // initiate transfer
            await initiatePaystackTransfer({
                source: 'balance',
                amount: payoutAmount,
                recipient: recipientCode,
                reason: `Payout for booking ${payload.booking_id}`
            })


            // update transaction after successfull payout
            await updateTransaction(transaction?.id, TransactionStatus.COMPLETED)

            logger.info(`Payout processed for booking ${payload.booking_id}`)

            // acknowledge -- telling rabbitmq this message was handled
            channel.ack(msg)
                
        } catch (error:any) {
            logger.error('Payout worker error', { error: error?.response?.data?.message || error })
    
            // don't requeue if it's a business account limitation
            if (error?.response?.data?.code === 'transfer_unavailable') {
                logger.warn('Transfer unavailable — account upgrade required')
                channel.ack(msg)  // acknowledge to remove from queue
            } else {
                channel.nack(msg, false, false)  // requeue for other errors
            }
        }
    })

}
