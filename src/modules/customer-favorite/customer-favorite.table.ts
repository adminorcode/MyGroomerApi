import { index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../shared/db/columns'

export const customerFavoriteProviders = pgTable('customer_favorite_providers', {
    customer_id: uuid('customer_id').notNull(),
    provider_id: uuid('provider_id').notNull(),
    created_at: timestamptz('created_at').defaultNow().notNull(),
}, (table) => [
    primaryKey({ columns: [table.customer_id, table.provider_id] }),
    index('customer_favorite_providers_provider_id_idx').on(table.provider_id),
])
