import { logger } from '../../config/logger.config'
import { PLATFORM_COMMISSION_RATE } from '../../constants'
import { getPayoutGateway } from '../../integrations/payouts/payout-gateway'
import { AppError } from '../../shared/errors'
import { findUserById } from '../auth/auth.service'
import { findProviderByUserId } from '../provider/provider.service'
import {
    fetchEligiblePayouts,
    findPayoutByBookingId,
    insertTransaction,
    listProviderPayouts as listProviderPayoutRows,
    updateTransaction,
} from './payout.repo'
import { PayoutJobPayload, TransactionStatus, TransactionType } from './payout.types'

const markCompleted = async (transactionId: string) => {
    const updated = await updateTransaction(transactionId, TransactionStatus.COMPLETED)
    if (!updated) throw new Error('payout status was not saved')
    return updated
}

export const listProviderPayouts = (providerUserId: string) => listProviderPayoutRows(providerUserId)

export const listEligiblePayouts = () => fetchEligiblePayouts()

export const settlePayout = async (payload: PayoutJobPayload) => {
    const existing = await findPayoutByBookingId(payload.booking_id)
    if (existing?.transaction_status === TransactionStatus.COMPLETED) return existing

    const provider = await findProviderByUserId(payload.provider_user_id)
    if (!provider) throw new Error(`Provider not found: ${payload.provider_user_id}`)
    if (!provider.payout_method) throw new Error('Provider has no payout method')

    const user = await findUserById(provider.user_id)
    const commission = payload.amount * PLATFORM_COMMISSION_RATE
    const payoutAmount = payload.amount - commission
    const momoProviderCodeMap: Record<string, string> = {
        mtn: 'MTN',
        telecel: 'VOD',
        airtel_tigo: 'ATL',
    }
    const bankCode = momoProviderCodeMap[provider.momo_provider as string]
    if (!bankCode) throw new Error(`Unknown momo provider: ${provider.momo_provider}`)

    const gateway = getPayoutGateway()
    const recipientCode = await gateway.createTransferRecipient({
        type: 'mobile_money',
        name: user?.name ?? 'Provider',
        account_number: provider.momo_number!,
        bank_code: bankCode,
        currency: 'GHS',
    })

    const transaction = existing ?? await insertTransaction({
        booking_id: payload.booking_id,
        customer_user_id: payload.customer_id,
        provider_user_id: provider.user_id,
        payment_id: payload.payment_id,
        amount: payoutAmount,
        transaction_type: TransactionType.PAYOUT,
        transaction_status: TransactionStatus.PENDING,
    })
    if (!transaction) throw new AppError('Não foi possível registrar o repasse', 500)

    await gateway.initiateTransfer({
        source: 'balance',
        amount: payoutAmount,
        recipient: recipientCode,
        reason: `Payout for booking ${payload.booking_id}`,
    })

    try {
        return await markCompleted(transaction.id)
    } catch (error) {
        logger.error('payout status update failed after gateway transfer; saving completed outside', { error })
        return markCompleted(transaction.id)
    }
}
