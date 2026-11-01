import { SQL } from 'drizzle-orm'
import { PoolClient } from 'pg'
import { col, execute, sql } from '../../shared/db/drizzle'
import { QueryType } from '../../types/pagination.types'
import { CreatePaymentInput, Payment, PaymentStatus } from './payment.types'
import { payments } from './payment.table'

export const insertPayment = async (paymentInput: CreatePaymentInput, client?: PoolClient): Promise<Payment | null> => {
    const result = await execute<Payment>(client, sql`
        INSERT INTO ${payments} (customer_id, booking_id, amount, payment_date, payment_status, paystack_reference)
        VALUES (
            ${paymentInput.customer_id},
            ${paymentInput.booking_id},
            ${paymentInput.amount},
            ${paymentInput.payment_date},
            ${PaymentStatus.PENDING},
            ${paymentInput.paystack_reference}
        )
        RETURNING *
    `)
    return result.rows[0] || null
}

export const lockPaymentByReference = async (reference: string, client: PoolClient): Promise<Payment | null> => {
    const result = await execute<Payment>(client, sql`
        SELECT * FROM ${payments} WHERE ${payments.paystack_reference} = ${reference} FOR UPDATE
    `)
    return result.rows[0] || null
}

export const findPaymentByReference = async (reference: string, client?: PoolClient): Promise<Payment | null> => {
    const result = await execute<Payment>(client, sql`
        SELECT * FROM ${payments} WHERE ${payments.paystack_reference} = ${reference}
    `)
    return result.rows[0] || null
}

export const findPaymentByBookingId = async (bookingId: string, client?: PoolClient): Promise<Payment | null> => {
    const result = await execute<Payment>(client, sql`
        SELECT * FROM ${payments} WHERE ${payments.booking_id} = ${bookingId}
    `)
    return result.rows[0] || null
}

export const updatePaymentStatus = async (
    reference: string,
    paymentStatus: PaymentStatus,
    client?: PoolClient,
): Promise<Payment | null> => {
    const result = await execute<Payment>(client, sql`
        UPDATE ${payments}
        SET ${col(payments.payment_status)} = ${paymentStatus}
        WHERE ${payments.paystack_reference} = ${reference}
        RETURNING *
    `)
    return result.rows[0] || null
}

export const fetchPayments = async (customerId: string, query: QueryType, client?: PoolClient): Promise<Payment[] | null> => {
    const conditions: SQL[] = []
    if (customerId) conditions.push(sql`${payments.customer_id} = ${customerId}`)
    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``
    const page = query.page || 1
    const limit = query.limit || 10
    const offset = (page - 1) * limit
    const result = await execute<Payment>(client, sql`
        SELECT * FROM ${payments}
        ${whereClause}
        LIMIT ${limit} OFFSET ${offset}
    `)
    return result.rows || null
}
