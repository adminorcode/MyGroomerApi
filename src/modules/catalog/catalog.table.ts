import { pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const categories = pgTable('categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    description: varchar('description'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
}, (table) => [
    uniqueIndex('categories_name_key').on(table.name),
])

export const services = pgTable('services', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    category_id: uuid('category_id'),
    image: varchar('image'),
    description: varchar('description'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
}, (table) => [
    uniqueIndex('services_name_key').on(table.name),
])
