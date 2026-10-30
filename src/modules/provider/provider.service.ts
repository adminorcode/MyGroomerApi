import { PoolClient } from 'pg'
import { getPool } from "../../config/database.config"
import { logger } from "../../config/logger.config"
import { CACHE_KEYS, CACHE_TTL } from "../../constants"
import { QueryType } from "../../types/pagination.types"
import { CoverageProvider, CreateProvider, CreateProviderService, Provider, ProviderService, PublicProfile } from "./provider.types"
import { AppError } from '../../shared/errors'
import { deleteCache, getCache, setCache } from "../../shared/cache/cache"
import { executor } from '../../shared/db/transaction'

// ------------------------------------------------
// provider
// ------------------------------------------------
export const insertProvider = async (provider_input: CreateProvider, client?: PoolClient): Promise<Provider | null> => {
    try {
        const result = await executor(client).query(
            `
            INSERT INTO providers (
                user_id, 
                payout_method, 
                momo_number, 
                momo_provider, 
                bank_account_number, 
                bank_account_name, 
                bank_code,
                id_document_url,
                service_area
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            `,
            [
                provider_input.user_id,
                provider_input.payout_method,
                provider_input.momo_number || null,
                provider_input.momo_provider || null,
                provider_input.bank_account_number || null,
                provider_input.bank_account_name || null,
                provider_input.bank_code || null,
                provider_input.id_document_url || null,
                provider_input.service_area || null
            ]
        )
        return result.rows[0] || null
    } catch (error) {
        throw error
    }
}

export const findProviderById = async(provider_id:string):Promise<Provider | null>=>{
    try {
        const pool = getPool()
        const result = await pool.query(
            `
            SELECT * FROM providers WHERE id=$1
            `,
            [provider_id]
        )
        return result.rows[0] || null
    } catch (error) {
        throw error
    }
}

export const findProviderByUserId = async (user_id: string): Promise<Provider | null> => {
    const pool = getPool()
    const result = await pool.query(
        `SELECT * FROM providers WHERE user_id = $1`,
        [user_id]
    )
    return result.rows[0] || null
}

export const fetchAllProviders = async(query:QueryType):Promise<Provider[] | null> => {
    try {
        const values = []
        let index = 1
        
        const page = query.page || 1
        const limit = query.limit || 10
        const offset = (page - 1) * limit
        values.push(limit)
        values.push(offset)

        const pool = getPool()
        const result = await pool.query(`
            SELECT
             providers.*,
             users.*
            FROM providers
            LEFT JOIN users ON providers.user_id = users.id
            LIMIT $${index++} OFFSET $${index++}
            `, values
        )
        return result.rows || null
    } catch (error) {
        throw error
    }
}

export const deleteProvider = async (provider_id: string): Promise<boolean> => {
    try {
        const pool = getPool()
        const result = await pool.query(
            `DELETE FROM providers WHERE id = $1`,
            [provider_id]
        )
        return (result.rowCount ?? 0) > 0
    } catch (error) {
        throw error
    }
}




// ------------------------------------------------
// provider service
// ------------------------------------------------
export const insertProviderService = async (provider_id:string, provider_service:Omit<CreateProviderService, 'provider_id'>):Promise<ProviderService | null> => {
    try {
        const pool = getPool()
        const result = await pool.query(
            `
            INSERT INTO provider_services (provider_id, service_id, price)
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [
                provider_id,
                provider_service.service_id,
                provider_service.price
            ]
        )
        await deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(provider_service.service_id))
        return result.rows[0] || null
    } catch (error) {
        throw error
    }
}

export const findProviderServiceById = async(provider_service_id:string):Promise<ProviderService | null> => {
    try {
        const pool = getPool()
        const result = await pool.query(`SELECT * FROM provider_services WHERE id=$1`,[provider_service_id])
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

export const findProviderServiceByIdWithProviderDetails = async(provider_service_id:string):Promise<ProviderServiceDetailed | null> => {
    try {
        const pool = getPool()
        const result = await pool.query(`
            SELECT 
                provider_services.*,
                providers.service_area,
                providers.total_jobs_completed,
                providers.is_verified,
                COALESCE(NULLIF(btrim(provider_services.custom_name), ''), services.name) as service_name,
                users.name as provider_name,
                users.profile_picture as provider_profile_picture,
                (
                    SELECT COALESCE(ROUND(AVG(r.rating), 1), 0)
                    FROM reviews r
                    WHERE r.provider_user_id = providers.user_id
                )::float as average_rating,
                (
                    SELECT COUNT(*)
                    FROM reviews r
                    WHERE r.provider_user_id = providers.user_id
                )::int as review_count
            FROM provider_services 
            LEFT JOIN providers ON provider_services.provider_id = providers.id
            LEFT JOIN users ON providers.user_id = users.id
            LEFT JOIN services ON provider_services.service_id = services.id
            WHERE provider_services.id=$1
            `,
            [provider_service_id]
        )
        return result.rows[0] || null
    } catch (error) {
        throw error
    }
}

export const findPublicProfileByOfferId = async (providerServiceId: string, requesterUserId?: string): Promise<PublicProfile | null> => {
    const pool = getPool()
    const entry = await pool.query(
        `
        SELECT
            provider_services.provider_id,
            provider_services.is_active,
            providers.user_id,
            providers.is_verified,
            providers.attendance_rules,
            users.name,
            users.profile_picture,
            (
                SELECT COALESCE(ROUND(AVG(r.rating), 1), 0)
                FROM reviews r
                WHERE r.provider_user_id = providers.user_id
            )::float AS average_rating,
            (
                SELECT COUNT(*)
                FROM reviews r
                WHERE r.provider_user_id = providers.user_id
            )::int AS review_count
        FROM provider_services
        INNER JOIN providers ON providers.id = provider_services.provider_id
        INNER JOIN users ON users.id = providers.user_id
        WHERE provider_services.id = $1
        `,
        [providerServiceId],
    )
    const row = entry.rows[0]
    if (!row) return null
    if (row.is_active === false && row.user_id !== requesterUserId) return null

    const services = await pool.query(
        `
        SELECT
            provider_services.id,
            COALESCE(NULLIF(btrim(provider_services.custom_name), ''), services.name) AS name,
            provider_services.price
        FROM provider_services
        LEFT JOIN services ON services.id = provider_services.service_id
        WHERE provider_services.provider_id = $1
          AND provider_services.is_active
          AND COALESCE(NULLIF(btrim(provider_services.custom_name), ''), services.name) IS NOT NULL
        ORDER BY name ASC, provider_services.id ASC
        `,
        [row.provider_id],
    )

    const rules = typeof row.attendance_rules === 'string' ? row.attendance_rules.trim() : ''

    return {
        provider_id: row.provider_id,
        name: row.name,
        photo_url: row.profile_picture ?? null,
        is_verified: row.is_verified === true,
        average_rating: Number(row.average_rating) || 0,
        review_count: Number(row.review_count) || 0,
        attendance_rules: rules.length > 0 ? rules : null,
        services: services.rows.flatMap(service => {
            const price = Number(service.price)
            if (!service.name || !Number.isFinite(price) || price <= 0) return []
            return [{ id: service.id, name: service.name, price }]
        }),
    }
}

export const fetchProviderServices = async(provider_id:string, query:QueryType, includeInactive = false):Promise<ProviderService[] | null> => {
    try {
        const values = []
        const conditions = []
        let index = 1
        
        if(provider_id){
            conditions.push(`provider_services.provider_id=$${index++}`)
            values.push(provider_id)
        }
        if (!includeInactive) {
            conditions.push('provider_services.is_active')
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        
        const page = query.page || 1
        const limit = query.limit || 10
        const offset = (page - 1) * limit
        values.push(limit)
        values.push(offset)

        const pool = getPool()
        const result = await pool.query(
            `
            SELECT 
                provider_services.*,
                services.name AS service_name,
                services.description AS service_description
            FROM provider_services
            LEFT JOIN services ON provider_services.service_id = services.id
            ${whereClause}
            ORDER BY provider_services.created_at DESC
            LIMIT $${index++} OFFSET $${index}
            `,
            values
        )
        return result.rows || null
    } catch (error) {
        throw error
    }
}

export const fetchServiceProviders = async(service_id:string):Promise<Provider[] | null> =>{
    try {
        const cacheKey = CACHE_KEYS.SERVICE_PROVIDERS(service_id)
        const cached = await getCache<Provider[]>(cacheKey)
        if (cached) {
            logger.info(`Providers for service ${service_id} served from cache`)
            return cached
        }

        const pool = getPool()
        const result = await pool.query(
            `
            SELECT 
                provider_services.id,
                provider_services.price,
                provider_services.service_id,
                providers.id as provider_id,
                providers.service_area,
                providers.total_jobs_completed,
                providers.is_verified,
                users.name,
                users.profile_picture
            FROM provider_services
            LEFT JOIN providers ON provider_services.provider_id = providers.id
            LEFT JOIN users ON providers.user_id = users.id
            WHERE provider_services.service_id = $1
              AND provider_services.is_active
            `,
            [service_id]
        )
        const providers = result.rows || []
        await setCache(cacheKey, providers, CACHE_TTL.PROVIDER_SERVICES)
        return providers
    } catch (error) {
        throw error
    }
}

export const fetchProvidersByCoverage = async (input: {
    latitude: number
    longitude: number
    serviceId?: string
    categoryId?: string
}): Promise<CoverageProvider[]> => {
    const pool = getPool()
    const result = await pool.query(
        `
        WITH located AS (
            SELECT
                providers.id,
                providers.user_id,
                providers.radius_km,
                users.name,
                users.profile_picture,
                (
                    6371 * acos(
                        LEAST(1::double precision, GREATEST(-1::double precision,
                            cos(radians($1)) * cos(radians(providers.base_latitude::double precision))
                            * cos(radians(providers.base_longitude::double precision) - radians($2))
                            + sin(radians($1)) * sin(radians(providers.base_latitude::double precision))
                        ))
                    )
                ) AS distance_km,
                (
                    SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)
                    FROM reviews r
                    WHERE r.provider_user_id = providers.user_id
                )::float AS average_rating,
                (
                    SELECT COUNT(*)::int
                    FROM reviews r
                    WHERE r.provider_user_id = providers.user_id
                ) AS review_count
            FROM providers
            INNER JOIN users ON providers.user_id = users.id
            WHERE providers.base_latitude IS NOT NULL
                AND providers.base_longitude IS NOT NULL
                AND providers.radius_km IS NOT NULL
        )
        SELECT
            picked.id,
            picked.provider_id,
            picked.service_id,
            picked.service_name,
            picked.name,
            picked.profile_picture,
            picked.price,
            picked.average_rating,
            picked.review_count,
            picked.radius_km,
            ROUND(picked.distance_km::numeric, 1)::float AS distance_km
        FROM (
            SELECT DISTINCT ON (located.id)
                provider_services.id,
                located.id AS provider_id,
                provider_services.service_id,
                COALESCE(services.name, provider_services.custom_name) AS service_name,
                located.name,
                located.profile_picture,
                provider_services.price,
                located.average_rating,
                located.review_count,
                located.radius_km,
                located.distance_km
            FROM located
            INNER JOIN provider_services ON provider_services.provider_id = located.id
            LEFT JOIN services ON provider_services.service_id = services.id
            WHERE located.distance_km <= located.radius_km
                AND provider_services.is_active
                AND COALESCE(services.name, provider_services.custom_name) IS NOT NULL
                AND ($3::uuid IS NULL OR provider_services.service_id = $3::uuid)
                AND (
                    $4::uuid IS NULL
                    OR services.category_id = $4::uuid
                    OR provider_services.category_id = $4::uuid
                )
            ORDER BY located.id, provider_services.price ASC, services.name ASC
        ) picked
        ORDER BY picked.distance_km ASC, picked.name ASC
        `,
        [input.latitude, input.longitude, input.serviceId ?? null, input.categoryId ?? null]
    )
    return result.rows
}

export const modifyProviderService = async(provider_service_id:string, service_id:string, update:CreateProviderService):Promise<ProviderService | null> => {
    try {
        await deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(service_id))
        const pool = getPool()

        const fields = []
        const values = []

        let index = 1

        if (update.provider_id){
            fields.push(`provider_id = $${index++}`)
            values.push(update.provider_id)
        }

        if (update.service_id){
            fields.push(`service_id = $${index++}`)
            values.push(update.service_id)
        }


        if (update.price){
            fields.push(`price = $${index++}`)
            values.push(update.price)
        }

        values.push(provider_service_id)

        if (fields.length === 0) {
            throw new Error('No fields to update')
        }

        const query = `
            UPDATE provider_services
            SET ${fields.join(', ')}
            WHERE id=$${index}
            RETURNING *`

        const result = await pool.query(query,values)
        const updated = result.rows[0] || null

        if (updated) {
            await deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(provider_service_id))
        }

        return updated
    } catch (error) {
        throw error
    }
}

export const deleteProviderService = async(provider_service_id:string):Promise<ProviderService | null> => {
    try {
        const pool = getPool()
        const result = await pool.query(
            `DELETE FROM provider_services WHERE id=$1 RETURNING *`,
            [provider_service_id]
        )
        
        if (result.rows[0]) await deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(result.rows[0].service_id))
    
        return result.rows[0] || null
    } catch (error) {
        throw error
    }
}
