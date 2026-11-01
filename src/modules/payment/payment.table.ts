import { numeric, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const paymentStatus = pgEnum('payment_status_type', ['pending', 'success', 'cancelled', 'failed', 'refunded'])

export const payments = pgTable('payments', {
    id: uuid('id').primaryKey().defaultRandom(),
    customer_id: uuid('customer_id'),
    booking_id: uuid('booking_id'),
    amount: numeric('amount'),
    payment_date: timestamptz('payment_date'),
    payment_status: paymentStatus('payment_status'),
    paystack_reference: varchar('paystack_reference'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
})
