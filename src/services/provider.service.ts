import { getPool } from "../config/database.config"
import { logger } from "../config/logger.config"
import { CACHE_KEYS, CACHE_TTL } from "../constants"
import { QueryType } from "../types/pagination.types"
import { CreateProvider, CreateProviderService, Provider, ProviderService } from "../types/provider.types"
import { Transaction } from "../types/transaction.types"
import { AppError } from '../middlewares/errorHandler'
import { deleteCache, getCache, setCache } from "../utils/cache.utils"

// ------------------------------------------------
// provider
// ------------------------------------------------
export const insertProvider = async (provider_input: CreateProvider): Promise<Provider | null> => {
    try {
        const pool = getPool()
        const result = await pool.query(
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
                services.name as service_name,
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

export const fetchProviderServices = async(provider_id:string, query:QueryType):Promise<ProviderService[] | null> => {
    try {
        const values = []
        const conditions = []
        let index = 1
        
        if(provider_id){
            conditions.push(`provider_services.provider_id=$${index++}`)
            values.push(provider_id)
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
        const bookings = await pool.query('SELECT 1 FROM bookings WHERE provider_service_id=$1 LIMIT 1', [provider_service_id])
        if (bookings.rowCount) throw new AppError('This service has bookings and cannot be deleted', 409)
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

export const fetchProviderTransactions = async (provider_user_id: string): Promise<Transaction[]> => {
    const pool = getPool()
    const result = await pool.query(
        `SELECT transactions.*, services.name as service_name, customer_users.name as customer_name
         FROM transactions
         LEFT JOIN bookings ON transactions.booking_id = bookings.id
         LEFT JOIN provider_services ON bookings.provider_service_id = provider_services.id
         LEFT JOIN services ON provider_services.service_id = services.id
         LEFT JOIN users AS customer_users ON transactions.customer_user_id = customer_users.id
         WHERE transactions.provider_user_id = $1 AND transactions.transaction_type = 'payout'
         ORDER BY transactions.created_at DESC`,
        [provider_user_id]
    )
    return result.rows
}
