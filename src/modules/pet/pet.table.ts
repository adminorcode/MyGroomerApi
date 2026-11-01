import { sql } from 'drizzle-orm'
import { check, integer, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const petSpecies = pgEnum('pet_species', ['dog', 'cat', 'other'])
export const petSize = pgEnum('pet_size', ['small', 'medium', 'large'])

export const pets = pgTable('pets', {
    id: uuid('id').primaryKey().defaultRandom(),
    owner_id: uuid('owner_id').notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    species: petSpecies('species').notNull(),
    breed: varchar('breed', { length: 80 }).notNull(),
    size: petSize('size').notNull(),
    age_years: integer('age_years').notNull(),
    notes: varchar('notes', { length: 500 }),
    photo_url: varchar('photo_url', { length: 2048 }),
    created_at: timestamptz('created_at').defaultNow().notNull(),
    updated_at: timestamptz('updated_at').defaultNow().notNull(),
}, (table) => [
    check('pets_age_years_check', sql`(${table.age_years} >= 0) AND (${table.age_years} <= 40)`),
    check('pets_name_not_blank', sql`(btrim(${table.name}) <> '')`),
    check('pets_breed_not_blank', sql`(btrim(${table.breed}) <> '')`),
])
