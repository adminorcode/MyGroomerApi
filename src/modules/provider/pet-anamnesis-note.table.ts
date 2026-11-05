import { sql } from 'drizzle-orm'
import { check, index, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const petAnamnesisNotes = pgTable('pet_anamnesis_notes', {
    id: uuid('id').primaryKey().defaultRandom(),
    pet_id: uuid('pet_id').notNull(),
    provider_id: uuid('provider_id').notNull(),
    booking_id: uuid('booking_id').notNull(),
    note: varchar('note', { length: 1000 }).notNull(),
    created_at: timestamptz('created_at').defaultNow().notNull(),
    updated_at: timestamptz('updated_at').defaultNow().notNull(),
}, (table) => [
    uniqueIndex('pet_anamnesis_notes_booking_id_key').on(table.booking_id),
    index('pet_anamnesis_notes_pet_provider_idx').on(table.pet_id, table.provider_id, table.created_at),
    check('pet_anamnesis_notes_not_blank', sql`(btrim(${table.note}) <> '')`),
])
