import { SQL } from 'drizzle-orm'
import { PoolClient } from 'pg'
import { logger } from '../../config/logger.config'
import { CACHE_KEYS, CACHE_TTL } from '../../constants'
import { QueryType } from '../../types/pagination.types'
import { CoverageSearchRow, CreateProvider, CreateProviderService, Provider, ProviderService, PublicProfile } from './provider.types'
import { presentPublicProfile } from './public-profile.service'
import { AppError } from '../../shared/errors'
import { deleteCache, getCache, setCache } from '../../shared/cache/cache'
import { col, execute, sql } from '../../shared/db/drizzle'
import { customerFavoriteProviders } from '../customer-favorite/customer-favorite.table'
import { providerServices, providers } from './provider.table'
import { professionalTypes, providerProfessionalTypes } from '../professional-type/professional-type.table'

export const insertProvider = async (provider_input: CreateProvider, client?: PoolClient): Promise<Provider | null> => {
    const result = await execute<Provider>(client, sql`
        INSERT INTO ${providers} (
            user_id, payout_method, momo_number, momo_provider, bank_account_number,
            bank_account_name, bank_code, id_document_url, service_area
        )
        VALUES (
            ${provider_input.user_id},
            ${provider_input.payout_method},
            ${provider_input.momo_number || null},
            ${provider_input.momo_provider || null},
            ${provider_input.bank_account_number || null},
            ${provider_input.bank_account_name || null},
            ${provider_input.bank_code || null},
            ${provider_input.id_document_url || null},
            ${provider_input.service_area || null}
        )
        RETURNING *
    `)
    return result.rows[0] || null
}

export const findProviderById = async (provider_id: string): Promise<Provider | null> => {
    const result = await execute<Provider>(undefined, sql`SELECT * FROM ${providers} WHERE ${providers.id} = ${provider_id}`)
    return result.rows[0] || null
}

export const findProviderByUserId = async (user_id: string): Promise<Provider | null> => {
    const result = await execute<Provider>(undefined, sql`SELECT * FROM ${providers} WHERE ${providers.user_id} = ${user_id}`)
    return result.rows[0] || null
}

export const findProviderUserId = async (providerId: string, client?: PoolClient): Promise<string | null> => {
    const result = await execute<{ user_id: string | null }>(client, sql`
        SELECT ${providers.user_id} AS user_id FROM ${providers} WHERE ${providers.id} = ${providerId}
    `)
    return result.rows[0]?.user_id ?? null
}

export const professionalTypeHasOffers = async (typeId: string, client: PoolClient): Promise<boolean> => {
    const result = await execute(client, sql`
        SELECT 1 FROM ${providerServices}
        WHERE ${providerServices.professional_type_id} = ${typeId}
        LIMIT 1
    `)
    return (result.rowCount ?? 0) > 0
}

export const fetchAllProviders = async (query: QueryType): Promise<Provider[] | null> => {
    const page = query.page || 1
    const limit = query.limit || 10
    const offset = (page - 1) * limit
    const result = await execute<Provider>(undefined, sql`
        SELECT ${providers}.*, users.*
        FROM ${providers}
        LEFT JOIN users ON ${providers.user_id} = users.id
        LIMIT ${limit} OFFSET ${offset}
    `)
    return result.rows || null
}

export const deleteProvider = async (provider_id: string): Promise<boolean> => {
    const result = await execute(undefined, sql`DELETE FROM ${providers} WHERE ${providers.id} = ${provider_id}`)
    return (result.rowCount ?? 0) > 0
}

export const insertProviderService = async (
    provider_id: string,
    provider_service: Omit<CreateProviderService, 'provider_id'>,
): Promise<ProviderService | null> => {
    const result = await execute<ProviderService>(undefined, sql`
        INSERT INTO ${providerServices} (provider_id, service_id, price)
        VALUES (${provider_id}, ${provider_service.service_id}, ${provider_service.price})
        RETURNING *
    `)
    await deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(provider_service.service_id))
    return result.rows[0] || null
}

export const findProviderServiceById = async (
    provider_service_id: string,
    client?: PoolClient,
    lock = false,
): Promise<ProviderService | null> => {
    try {
        const share = lock && client ? sql` FOR SHARE` : sql``
        const result = await execute<ProviderService>(client, sql`
            SELECT * FROM ${providerServices} WHERE ${providerServices.id} = ${provider_service_id}${share}
        `)
        return result.rows[0] || null
    } catch (error) {
        logger.error('findProviderServiceById error', { error })
        throw error
    }
}

type ProviderServiceDetailed = ProviderService & {
    service_name: string
    provider_name: string
    provider_profile_picture: string
    average_rating: number
    review_count: number
    total_jobs_completed: number
    is_verified: boolean
    service_area: string
}

export const findProviderServiceByIdWithProviderDetails = async (provider_service_id: string): Promise<ProviderServiceDetailed | null> => {
    const result = await execute<ProviderServiceDetailed>(undefined, sql`
        SELECT
            ${providerServices}.*,
            ${providers.service_area},
            ${providers.total_jobs_completed},
            ${providers.is_verified},
            COALESCE(NULLIF(btrim(${providerServices.custom_name}), ''), services.name) as service_name,
            users.name as provider_name,
            users.profile_picture as provider_profile_picture,
            (
                SELECT COALESCE(ROUND(AVG(r.rating), 1), 0)
                FROM reviews r
                WHERE r.provider_user_id = ${providers.user_id}
            )::float as average_rating,
            (
                SELECT COUNT(*)
                FROM reviews r
                WHERE r.provider_user_id = ${providers.user_id}
            )::int as review_count
        FROM ${providerServices}
        LEFT JOIN ${providers} ON ${providerServices.provider_id} = ${providers.id}
        LEFT JOIN users ON ${providers.user_id} = users.id
        LEFT JOIN services ON ${providerServices.service_id} = services.id
        WHERE ${providerServices.id} = ${provider_service_id}
    `)
    return result.rows[0] || null
}

export const findPublicProfileByOfferId = async (providerServiceId: string, requesterUserId?: string): Promise<PublicProfile | null> => {
    const entry = await execute<{ provider_id: string, is_active: boolean, user_id: string }>(undefined, sql`
        SELECT
            ${providerServices.provider_id} AS provider_id,
            ${providerServices.is_active} AS is_active,
            ${providers.user_id} AS user_id
        FROM ${providerServices}
        INNER JOIN ${providers} ON ${providers.id} = ${providerServices.provider_id}
        WHERE ${providerServices.id} = ${providerServiceId}
    `)
    const row = entry.rows[0]
    if (!row) return null
    if (row.is_active === false && row.user_id !== requesterUserId) return null
    return presentPublicProfile(row.provider_id)
}

export const fetchProviderServices = async (
    provider_id: string,
    query: QueryType,
    includeInactive = false,
): Promise<ProviderService[] | null> => {
    const conditions: SQL[] = []
    if (provider_id) conditions.push(sql`${providerServices.provider_id} = ${provider_id}`)
    if (!includeInactive) conditions.push(sql`${providerServices.is_active}`)
    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``
    const page = query.page || 1
    const limit = query.limit || 10
    const offset = (page - 1) * limit
    const result = await execute<ProviderService>(undefined, sql`
        SELECT
            ${providerServices}.*,
            services.name AS service_name,
            services.description AS service_description
        FROM ${providerServices}
        LEFT JOIN services ON ${providerServices.service_id} = services.id
        ${whereClause}
        ORDER BY ${providerServices.created_at} DESC
        LIMIT ${limit} OFFSET ${offset}
    `)
    return result.rows || null
}

export const fetchServiceProviders = async (service_id: string): Promise<Provider[] | null> => {
    const cacheKey = CACHE_KEYS.SERVICE_PROVIDERS(service_id)
    const cached = await getCache<Provider[]>(cacheKey)
    if (cached) {
        logger.info(`Providers for service ${service_id} served from cache`)
        return cached
    }
    const result = await execute<Provider>(undefined, sql`
        SELECT
            ${providerServices.id},
            ${providerServices.price},
            ${providerServices.service_id},
            ${providers.id} as provider_id,
            ${providers.service_area},
            ${providers.total_jobs_completed},
            ${providers.is_verified},
            users.name,
            users.profile_picture
        FROM ${providerServices}
        LEFT JOIN ${providers} ON ${providerServices.provider_id} = ${providers.id}
        LEFT JOIN users ON ${providers.user_id} = users.id
        WHERE ${providerServices.service_id} = ${service_id}
          AND ${providerServices.is_active}
    `)
    const rows = result.rows || []
    await setCache(cacheKey, rows, CACHE_TTL.PROVIDER_SERVICES)
    return rows
}

// Escapa os curingas do LIKE/ILIKE (o escape padrão do Postgres é a barra invertida).
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

export const fetchProvidersByCoverage = async (input: {
    latitude: number
    longitude: number
    customerId: string
    serviceId?: string
    categoryId?: string
    text?: string
}): Promise<CoverageSearchRow[]> => {
    const pattern = input.text ? `%${escapeLike(input.text)}%` : null
    const result = await execute<CoverageSearchRow>(undefined, sql`
        WITH located AS (
            SELECT
                ${providers.id},
                ${providers.user_id},
                ${providers.radius_km},
                users.name,
                users.profile_picture,
                ${providers.is_verified} AS is_verified,
                EXISTS (
                    SELECT 1 FROM ${customerFavoriteProviders} fav
                    WHERE fav.provider_id = ${providers.id}
                      AND fav.customer_id = ${input.customerId}
                ) AS is_favorite,
                (
                    6371 * acos(
                        LEAST(1::double precision, GREATEST(-1::double precision,
                            cos(radians(${input.latitude})) * cos(radians(${providers.base_latitude}::double precision))
                            * cos(radians(${providers.base_longitude}::double precision) - radians(${input.longitude}))
                            + sin(radians(${input.latitude})) * sin(radians(${providers.base_latitude}::double precision))
                        ))
                    )
                ) AS distance_km,
                (
                    SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)
                    FROM reviews r
                    WHERE r.provider_user_id = ${providers.user_id}
                )::float AS average_rating,
                (
                    SELECT COUNT(*)::int
                    FROM reviews r
                    WHERE r.provider_user_id = ${providers.user_id}
                ) AS review_count
            FROM ${providers}
            INNER JOIN users ON ${providers.user_id} = users.id
            WHERE ${providers.base_latitude} IS NOT NULL
                AND ${providers.base_longitude} IS NOT NULL
                AND ${providers.radius_km} IS NOT NULL
        ),
        nearby AS (
            SELECT located.*
            FROM located
            WHERE located.distance_km <= located.radius_km
        ),
        offers AS (
            SELECT
                nearby.id AS provider_id,
                ${providerServices.id} AS offer_id,
                ${providerServices.service_id} AS service_id,
                COALESCE(services.name, ${providerServices.custom_name}) AS service_name,
                ${providerServices.price} AS price
            FROM nearby
            INNER JOIN ${providerServices} ON ${providerServices.provider_id} = nearby.id
            LEFT JOIN services ON ${providerServices.service_id} = services.id
            WHERE ${providerServices.is_active}
                AND COALESCE(services.name, ${providerServices.custom_name}) IS NOT NULL
                AND (${input.serviceId ?? null}::uuid IS NULL OR ${providerServices.service_id} = ${input.serviceId ?? null}::uuid)
                AND (
                    ${input.categoryId ?? null}::uuid IS NULL
                    OR services.category_id = ${input.categoryId ?? null}::uuid
                    OR ${providerServices.category_id} = ${input.categoryId ?? null}::uuid
                )
        ),
        groomers AS (
            SELECT nearby.*
            FROM nearby
            WHERE EXISTS (SELECT 1 FROM offers WHERE offers.provider_id = nearby.id)
                AND (
                    ${pattern}::text IS NULL
                    OR nearby.name ILIKE ${pattern}
                    OR EXISTS (
                        SELECT 1
                        FROM ${providerProfessionalTypes}
                        INNER JOIN ${professionalTypes} ON ${professionalTypes.id} = ${providerProfessionalTypes.professional_type_id}
                        WHERE ${providerProfessionalTypes.provider_id} = nearby.id
                            AND ${professionalTypes.is_active}
                            AND ${professionalTypes.name} ILIKE ${pattern}
                    )
                    OR EXISTS (
                        SELECT 1 FROM offers
                        WHERE offers.provider_id = nearby.id
                            AND offers.service_name ILIKE ${pattern}
                    )
                )
        )
        SELECT
            first_offer.offer_id AS id,
            groomers.id AS provider_id,
            first_offer.service_id,
            first_offer.service_name,
            groomers.name,
            groomers.profile_picture,
            first_offer.price::float AS price,
            groomers.average_rating,
            groomers.review_count,
            groomers.radius_km::float AS radius_km,
            ROUND(groomers.distance_km::numeric, 1)::float AS distance_km,
            COALESCE((
                SELECT json_agg(json_build_object(
                    'id', offers.offer_id,
                    'service_id', offers.service_id,
                    'service_name', offers.service_name,
                    'price', offers.price::float
                ) ORDER BY lower(offers.service_name), offers.service_name, offers.offer_id)
                FROM offers
                WHERE offers.provider_id = groomers.id
            ), '[]'::json) AS services,
            COALESCE((
                SELECT json_agg(types.name ORDER BY lower(types.name), types.name)
                FROM ${providerProfessionalTypes}
                INNER JOIN ${professionalTypes} AS types ON types.id = ${providerProfessionalTypes.professional_type_id}
                WHERE ${providerProfessionalTypes.provider_id} = groomers.id
                    AND types.is_active
            ), '[]'::json) AS professional_types,
            groomers.is_verified,
            groomers.is_favorite
        FROM groomers
        INNER JOIN LATERAL (
            SELECT offers.offer_id, offers.service_id, offers.service_name, offers.price
            FROM offers
            WHERE offers.provider_id = groomers.id
            ORDER BY offers.price ASC, offers.service_name ASC, offers.offer_id ASC
            LIMIT 1
        ) first_offer ON true
        ORDER BY groomers.distance_km ASC, groomers.name ASC
    `)
    return result.rows
}

export const modifyProviderService = async (
    provider_service_id: string,
    service_id: string,
    update: CreateProviderService,
): Promise<ProviderService | null> => {
    await deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(service_id))
    const assignments: SQL[] = []
    if (update.provider_id) assignments.push(sql`${col(providerServices.provider_id)} = ${update.provider_id}`)
    if (update.service_id) assignments.push(sql`${col(providerServices.service_id)} = ${update.service_id}`)
    if (update.price) assignments.push(sql`${col(providerServices.price)} = ${update.price}`)
    if (assignments.length === 0) throw new Error('No fields to update')
    const result = await execute<ProviderService>(undefined, sql`
        UPDATE ${providerServices}
        SET ${sql.join(assignments, sql`, `)}
        WHERE ${providerServices.id} = ${provider_service_id}
        RETURNING *
    `)
    const updated = result.rows[0] || null
    if (updated) await deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(provider_service_id))
    return updated
}

export const deleteProviderService = async (provider_service_id: string): Promise<ProviderService | null> => {
    const result = await execute<ProviderService>(undefined, sql`
        DELETE FROM ${providerServices} WHERE ${providerServices.id} = ${provider_service_id} RETURNING *
    `)
    if (result.rows[0]) await deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(result.rows[0].service_id))
    return result.rows[0] || null
}
