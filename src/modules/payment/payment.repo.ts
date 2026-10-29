import { PoolClient } from 'pg'
import { executor } from '../../shared/db/transaction'
import { QueryType } from '../../types/pagination.types'
import { CreatePaymentInput, Payment, PaymentStatus } from './payment.types'

export const insertPayment = async (paymentInput: CreatePaymentInput, client?: PoolClient): Promise<Payment | null> => {
    const result = await executor(client).query(
        `
        INSERT INTO payments (customer_id, booking_id, amount, payment_date, payment_status, paystack_reference)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [
            paymentInput.customer_id,
            paymentInput.booking_id,
            paymentInput.amount,
            paymentInput.payment_date,
            PaymentStatus.PENDING,
            paymentInput.paystack_reference,
        ],
    )
    return result.rows[0] || null
}

export const lockPaymentByReference = async (reference: string, client: PoolClient): Promise<Payment | null> => {
    const result = await client.query(
        `SELECT * FROM payments WHERE paystack_reference=$1 FOR UPDATE`,
        [reference],
    )
    return result.rows[0] || null
}

export const findPaymentByReference = async (reference: string, client?: PoolClient): Promise<Payment | null> => {
    const result = await executor(client).query(
        `SELECT * FROM payments WHERE paystack_reference=$1`,
        [reference],
    )
    return result.rows[0] || null
}

export const findPaymentByBookingId = async (bookingId: string, client?: PoolClient): Promise<Payment | null> => {
    const result = await executor(client).query(
        `SELECT * FROM payments WHERE booking_id=$1`,
        [bookingId],
    )
    return result.rows[0] || null
}

export const updatePaymentStatus = async (
    reference: string,
    paymentStatus: PaymentStatus,
    client?: PoolClient,
): Promise<Payment | null> => {
    const result = await executor(client).query(
        `
        UPDATE payments
        SET payment_status=$1
        WHERE paystack_reference=$2
        RETURNING *
        `,
        [paymentStatus, reference],
    )
    return result.rows[0] || null
}

export const fetchPayments = async (customerId: string, query: QueryType, client?: PoolClient): Promise<Payment[] | null> => {
    const conditions = []
    const values = []
    let index = 1

    if (customerId) {
        conditions.push(`payments.customer_id=$${index++}`)
        values.push(customerId)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const page = query.page || 1
    const limit = query.limit || 10
    const offset = (page - 1) * limit
    values.push(limit)
    values.push(offset)

    const result = await executor(client).query(
        `
        SELECT * FROM payments
        ${whereClause}
        LIMIT $${index++} OFFSET $${index++}
        `,
        values,
    )
    return result.rows || null
}
