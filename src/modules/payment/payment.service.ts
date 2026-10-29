import { PoolClient } from 'pg'
import { getPool } from '../../config/database.config'
import { logger } from '../../config/logger.config'
import { AppError } from '../../shared/errors'
import { QueryType } from '../../types/pagination.types'
import { CreatePaymentInput, Payment, PaymentStatus } from './payment.types'
import {
    fetchPayments,
    findPaymentByBookingId,
    findPaymentByReference,
    insertPayment,
    lockPaymentByReference,
    updatePaymentStatus,
} from './payment.repo'

export { findPaymentByBookingId, findPaymentByReference, insertPayment, lockPaymentByReference, updatePaymentStatus }

const sources: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
    [PaymentStatus.SUCCESS]: [PaymentStatus.PENDING, PaymentStatus.FAILED],
    [PaymentStatus.FAILED]: [PaymentStatus.PENDING],
    [PaymentStatus.CANCELLED]: [PaymentStatus.PENDING],
    [PaymentStatus.REFUNDED]: [PaymentStatus.SUCCESS],
}

export type PaymentStatusChange = {
    payment: Payment
    alreadyApplied: boolean
    rejected: boolean
}

export const withPaymentLock = async <T>(reference: string, operation: () => Promise<T>): Promise<T> => {
    const client = await getPool().connect()
    let locked = false
    try {
        await client.query('SELECT pg_advisory_lock(hashtext($1)::bigint)', [reference])
        locked = true
        return await operation()
    } finally {
        if (locked) {
            await client.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [reference]).catch((error) => {
                logger.error('payment advisory unlock failed', { error })
            })
        }
        client.release()
    }
}

export const applyPaymentStatus = async (
    reference: string,
    paymentStatus: PaymentStatus,
    client: PoolClient,
): Promise<PaymentStatusChange | null> => {
    const current = await lockPaymentByReference(reference, client)
    if (!current) return null
    if (current.payment_status === paymentStatus) return { payment: current, alreadyApplied: true, rejected: false }
    const allowed = sources[paymentStatus] ?? []
    if (!allowed.includes(current.payment_status)) {
        return { payment: current, alreadyApplied: false, rejected: true }
    }
    const updated = await updatePaymentStatus(reference, paymentStatus, client)
    if (!updated) return null
    return { payment: updated, alreadyApplied: false, rejected: false }
}

export const listPayments = async (customerId: string, query: QueryType) => fetchPayments(customerId, query)

export const recordPayment = async (paymentInput: CreatePaymentInput, client?: PoolClient) => {
    const payment = await insertPayment(paymentInput, client)
    if (!payment) throw new AppError('Não foi possível iniciar o pagamento', 500)
    return payment
}
