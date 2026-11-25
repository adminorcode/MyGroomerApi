import { sql } from 'drizzle-orm'
import { boolean, check, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const categories = pgTable('categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    description: varchar('description'),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
}, (table) => [
    check('categories_name_not_blank', sql`(btrim(${table.name}) <> '')`),
    uniqueIndex('categories_name_lower_idx').on(sql`lower(btrim(${table.name}))`),
])

export const services = pgTable('services', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    category_id: uuid('category_id'),
    image: varchar('image'),
    description: varchar('description'),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
}, (table) => [
    check('services_name_not_blank', sql`(btrim(${table.name}) <> '')`),
    uniqueIndex('services_name_lower_idx').on(sql`lower(btrim(${table.name}))`),
])
