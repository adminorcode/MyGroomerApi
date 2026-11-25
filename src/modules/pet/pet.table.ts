import { sql } from 'drizzle-orm'
import { boolean, check, integer, numeric, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { bytea, timestamptz } from '../../shared/db/columns'

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
    weight_kg: numeric('weight_kg', { precision: 6, scale: 2 }),
    photo: bytea('photo'),
    photo_mime: varchar('photo_mime', { length: 32 }),
    photo_id: uuid('photo_id'),
    allergies: varchar('allergies', { length: 500 }),
    medications: varchar('medications', { length: 500 }),
    health_conditions: varchar('health_conditions', { length: 500 }),
    vaccination_up_to_date: boolean('vaccination_up_to_date'),
    behavior: varchar('behavior', { length: 500 }),
    special_care: varchar('special_care', { length: 500 }),
    created_at: timestamptz('created_at').defaultNow().notNull(),
    updated_at: timestamptz('updated_at').defaultNow().notNull(),
}, (table) => [
    check('pets_age_years_check', sql`(${table.age_years} >= 0) AND (${table.age_years} <= 40)`),
    check('pets_name_not_blank', sql`(btrim(${table.name}) <> '')`),
    check('pets_breed_not_blank', sql`(btrim(${table.breed}) <> '')`),
    check('pets_weight_kg_check', sql`(${table.weight_kg} IS NULL) OR ((${table.weight_kg} > 0) AND (${table.weight_kg} <= 999.99))`),
    check('pets_photo_pair', sql`((${table.photo} IS NULL) AND (${table.photo_mime} IS NULL) AND (${table.photo_id} IS NULL)) OR ((${table.photo} IS NOT NULL) AND (${table.photo_mime} IN ('image/jpeg', 'image/png')) AND (${table.photo_id} IS NOT NULL))`),
])
