import { PoolClient } from 'pg'
import { logger } from '../../config/logger.config'
import { col, execute, sql } from '../../shared/db/drizzle'
import { CreateTransaction, PayoutBookings, ProviderPayoutRow, Transaction, TransactionStatus, TransactionType } from './payout.types'
import { transactions } from './transaction.table'

export const insertTransaction = async (input: CreateTransaction, client?: PoolClient): Promise<Transaction | null> => {
    try {
        const result = await execute<Transaction>(client, sql`
            INSERT INTO ${transactions} (
                booking_id, customer_user_id, provider_user_id, payment_id, amount, transaction_type, transaction_status
            )
            VALUES (
                ${input.booking_id}, ${input.customer_user_id}, ${input.provider_user_id}, ${input.payment_id},
                ${input.amount}, ${input.transaction_type}, ${input.transaction_status}
            )
            RETURNING *
        `)
        return result.rows[0] || null
    } catch (error) {
        logger.error('insert transaction error', { error })
        throw error
    }
}

export const findPayoutByBookingId = async (bookingId: string, client?: PoolClient): Promise<Transaction | null> => {
    const result = await execute<Transaction>(client, sql`
        SELECT * FROM ${transactions}
        WHERE ${transactions.booking_id} = ${bookingId} AND ${transactions.transaction_type} = ${TransactionType.PAYOUT}
        ORDER BY ${transactions.created_at} DESC
        LIMIT 1
    `)
    return result.rows[0] || null
}

export const updateTransaction = async (
    transactionId: string,
    transactionStatus: TransactionStatus,
    client?: PoolClient,
): Promise<Transaction | null> => {
    try {
        const result = await execute<Transaction>(client, sql`
            UPDATE ${transactions}
            SET ${col(transactions.transaction_status)} = ${transactionStatus},
                ${col(transactions.updated_at)} = NOW()
            WHERE ${transactions.id} = ${transactionId}
            RETURNING *
        `)
        return result.rows[0] || null
    } catch (error) {
        logger.error('updateTransaction error', { error })
        throw error
    }
}

export const fetchEligiblePayouts = async (): Promise<PayoutBookings[]> => {
    try {
        const result = await execute<PayoutBookings>(undefined, sql`
            SELECT
                bookings.*,
                payments.id as payment_id,
                payments.amount as payment_amount,
                providers.user_id as provider_user_id
            FROM bookings
            LEFT JOIN ${transactions} ON bookings.id = ${transactions.booking_id}
            LEFT JOIN payments ON bookings.id = payments.booking_id
            LEFT JOIN provider_services ON bookings.provider_service_id = provider_services.id
            LEFT JOIN providers ON provider_services.provider_id = providers.id
            WHERE bookings.booking_status = 'completed'
            AND bookings.completed_at < NOW() - INTERVAL '24 hours'
            AND ${transactions.id} IS NULL
            AND payments.payment_status = 'success'
        `)
        return result.rows
    } catch (error) {
        logger.error('fetchEligiblePayouts error', { error })
        throw error
    }
}

export const listProviderPayouts = async (providerUserId: string): Promise<ProviderPayoutRow[]> => {
    const result = await execute<ProviderPayoutRow>(undefined, sql`
        SELECT ${transactions}.*, services.name as service_name, customer_users.name as customer_name
        FROM ${transactions}
        LEFT JOIN bookings ON ${transactions.booking_id} = bookings.id
        LEFT JOIN provider_services ON bookings.provider_service_id = provider_services.id
        LEFT JOIN services ON provider_services.service_id = services.id
        LEFT JOIN users AS customer_users ON ${transactions.customer_user_id} = customer_users.id
        WHERE ${transactions.provider_user_id} = ${providerUserId}
          AND ${transactions.transaction_type} = 'payout'
        ORDER BY ${transactions.created_at} DESC
    `)
    return result.rows
}
