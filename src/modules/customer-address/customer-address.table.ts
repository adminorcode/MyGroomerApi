import { sql } from 'drizzle-orm'
import { boolean, check, index, numeric, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const customerAddresses = pgTable('customer_addresses', {
    id: uuid('id').primaryKey().defaultRandom(),
    customer_id: uuid('customer_id').notNull(),
    label: varchar('label', { length: 16 }).notNull(),
    address: varchar('address', { length: 200 }).notNull(),
    complement: varchar('complement', { length: 120 }),
    latitude: numeric('latitude').notNull(),
    longitude: numeric('longitude').notNull(),
    is_default: boolean('is_default').notNull().default(false),
    created_at: timestamptz('created_at').defaultNow().notNull(),
    updated_at: timestamptz('updated_at').defaultNow().notNull(),
}, (table) => [
    index('customer_addresses_customer_id_idx').on(table.customer_id),
    uniqueIndex('customer_addresses_one_default_idx').on(table.customer_id).where(sql`${table.is_default}`),
    check('customer_addresses_label_check', sql`${table.label} IN ('home', 'work', 'other')`),
    check('customer_addresses_address_not_blank', sql`(btrim(${table.address}) <> '')`),
    check('customer_addresses_latitude_check', sql`${table.latitude} >= -34 AND ${table.latitude} <= 6`),
    check('customer_addresses_longitude_check', sql`${table.longitude} >= -74 AND ${table.longitude} <= -34`),
])
