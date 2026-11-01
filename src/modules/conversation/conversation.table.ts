import { boolean, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const conversations = pgTable('conversations', {
    id: uuid('id').primaryKey().defaultRandom(),
    booking_id: uuid('booking_id'),
    customer_id: uuid('customer_id'),
    provider_id: uuid('provider_id'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
}, (table) => [
    uniqueIndex('conversations_booking_id_key').on(table.booking_id),
])

export const messages = pgTable('messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    content: varchar('content'),
    conversation_id: uuid('conversation_id'),
    sender_id: uuid('sender_id'),
    timestamp: timestamptz('timestamp'),
    is_seen: boolean('is_seen').notNull().default(false),
    is_edited: boolean('is_edited').notNull().default(false),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
})
