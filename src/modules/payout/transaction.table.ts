import { numeric, pgEnum, pgTable, uuid } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const transactionType = pgEnum('transaction_type_enum', ['payout', 'payin', 'refund'])
export const transactionStatus = pgEnum('transaction_status_enum', ['pending', 'completed', 'cancelled'])

export const transactions = pgTable('transactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    booking_id: uuid('booking_id'),
    customer_user_id: uuid('customer_user_id'),
    provider_user_id: uuid('provider_user_id'),
    payment_id: uuid('payment_id'),
    amount: numeric('amount'),
    transaction_type: transactionType('transaction_type'),
    transaction_status: transactionStatus('transaction_status'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
})
