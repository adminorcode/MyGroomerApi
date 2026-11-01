import { sql } from 'drizzle-orm'
import { check, integer, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const reviews = pgTable('reviews', {
    id: uuid('id').primaryKey().defaultRandom(),
    customer_id: uuid('customer_id'),
    provider_user_id: uuid('provider_user_id'),
    booking_id: uuid('booking_id'),
    rating: integer('rating'),
    comment: varchar('comment'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
}, (table) => [
    uniqueIndex('reviews_booking_id_key').on(table.booking_id),
    check('reviews_rating_check', sql`(${table.rating} >= 1) AND (${table.rating} <= 5)`),
])
