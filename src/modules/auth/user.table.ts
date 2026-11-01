import { boolean, pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const userRole = pgEnum('user_role', ['provider', 'customer', 'admin'])

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    email: varchar('email').notNull(),
    password: varchar('password'),
    role: userRole('role').notNull(),
    phone_number: varchar('phone_number'),
    address: varchar('address'),
    profile_picture: varchar('profile_picture'),
    is_online: boolean('is_online').default(false),
    email_verification_token: varchar('email_verification_token'),
    email_verified_at: timestamptz('email_verified_at'),
    forgot_password_token: varchar('forgot_password_token'),
    email_verification_token_expires_at: timestamptz('email_verification_token_expires_at'),
    forgot_password_token_expires_at: timestamptz('forgot_password_token_expires_at'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
    google_id: varchar('google_id'),
    terms_accepted_at: timestamptz('terms_accepted_at'),
}, (table) => [
    uniqueIndex('users_email_key').on(table.email),
    uniqueIndex('users_google_id_key').on(table.google_id),
])
