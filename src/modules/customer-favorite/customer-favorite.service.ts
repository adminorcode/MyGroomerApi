import { AppError } from '../../shared/errors'
import { execute, sql } from '../../shared/db/drizzle'
import { providers } from '../provider/provider.table'
import { customerFavoriteProviders } from './customer-favorite.table'

export const addFavoriteProvider = async (customerId: string, providerId: string) => {
    const provider = await execute<{ id: string }>(undefined, sql`
        SELECT ${providers.id} AS id FROM ${providers} WHERE ${providers.id} = ${providerId}
    `)
    if (!provider.rows[0]) throw new AppError('Profissional não encontrado', 404)
    await execute(undefined, sql`
        INSERT INTO ${customerFavoriteProviders} (customer_id, provider_id)
        VALUES (${customerId}, ${providerId})
        ON CONFLICT (customer_id, provider_id) DO NOTHING
    `)
    return { provider_id: providerId, is_favorite: true }
}

export const removeFavoriteProvider = async (customerId: string, providerId: string) => {
    await execute(undefined, sql`
        DELETE FROM ${customerFavoriteProviders}
        WHERE ${customerFavoriteProviders.customer_id} = ${customerId}
          AND ${customerFavoriteProviders.provider_id} = ${providerId}
    `)
    return { provider_id: providerId, is_favorite: false }
}
