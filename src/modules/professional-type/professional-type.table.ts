import { sql } from 'drizzle-orm'
import { boolean, check, pgTable, primaryKey, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const professionalTypes = pgTable('professional_types', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull(),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamptz('created_at').defaultNow().notNull(),
    updated_at: timestamptz('updated_at').defaultNow().notNull(),
}, (table) => [
    check('professional_types_name_not_blank', sql`(btrim(${table.name}) <> '')`),
    uniqueIndex('professional_types_name_lower_idx').on(sql`lower(btrim(${table.name}))`),
])

export const providerProfessionalTypes = pgTable('provider_professional_types', {
    provider_id: uuid('provider_id').notNull(),
    professional_type_id: uuid('professional_type_id').notNull(),
    created_at: timestamptz('created_at').defaultNow().notNull(),
}, (table) => [
    primaryKey({ columns: [table.provider_id, table.professional_type_id] }),
])
