import { sql } from 'drizzle-orm'
import { check, index, integer, numeric, pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const bookingStatus = pgEnum('booking_status_type', [
    'pending_payment',
    'pending_confirmation',
    'confirmed',
    'en_route',
    'cancelled',
    'in_progress',
    'completed',
])

export const bookings = pgTable('bookings', {
    id: uuid('id').primaryKey().defaultRandom(),
    customer_id: uuid('customer_id'),
    provider_service_id: uuid('provider_service_id'),
    scheduled_at: timestamptz('scheduled_at'),
    booking_status: bookingStatus('booking_status'),
    customer_location: varchar('customer_location'),
    customer_latitude: numeric('customer_latitude'),
    customer_longitude: numeric('customer_longitude'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
    completed_at: timestamptz('completed_at'),
    pet_id: uuid('pet_id'),
    duration_minutes: integer('duration_minutes'),
    service_price: numeric('service_price'),
    provider_rejected_at: timestamptz('provider_rejected_at'),
}, (table) => [
    index('bookings_customer_idx').on(table.customer_id, table.created_at),
    index('bookings_provider_service_idx').on(table.provider_service_id),
    index('bookings_offer_schedule_idx').on(table.provider_service_id, table.scheduled_at).where(sql`${table.booking_status} IS DISTINCT FROM 'cancelled'`),
    uniqueIndex('bookings_open_request_idx').on(table.customer_id, table.pet_id, table.provider_service_id, table.scheduled_at).where(sql`${table.booking_status} IS DISTINCT FROM 'cancelled'`),
    check('bookings_duration_minutes_check', sql`${table.duration_minutes} BETWEEN 1 AND 600`),
    check('bookings_service_price_check', sql`${table.service_price} >= 0`),
])
