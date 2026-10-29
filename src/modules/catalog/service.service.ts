import { getPool } from '../../config/database.config'
import { logger } from '../../config/logger.config'
import { CACHE_KEYS, CACHE_TTL } from '../../constants'
import { deleteCache, deleteCachePattern, getCache, setCache } from '../../shared/cache/cache'
import { QueryType } from '../../types/pagination.types'
import { CreateService, Service, ServiceWithCategory } from './service.types'

export const fetchAllServices = async (categoryId: string | undefined, query: QueryType): Promise<ServiceWithCategory[] | null> => {
    const conditions = []
    const values = []
    let index = 1

    if (categoryId) {
        conditions.push(`services.category_id = $${index++}`)
        values.push(categoryId)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const page = query.page || 1
    const limit = query.limit || 10
    const offset = (page - 1) * limit
    values.push(limit)
    values.push(offset)

    const cacheKey = CACHE_KEYS.SERVICES_ALL(`${categoryId || 'all'}_page${page}_limit${limit}`)
    const cached = await getCache<ServiceWithCategory[]>(cacheKey)
    if (cached) {
        logger.info('Services served from cache')
        return cached
    }

    const pool = getPool()
    const result = await pool.query(
        `
        SELECT
            services.*,
            categories.name AS category_name,
            categories.description AS category_description
        FROM services
        LEFT JOIN categories ON services.category_id = categories.id
        ${whereClause}
        LIMIT $${index++} OFFSET $${index++}
        `,
        values,
    )

    await setCache(cacheKey, result.rows, CACHE_TTL.SERVICES)
    return result.rows || null
}

export const findServiceById = async (serviceId: string): Promise<ServiceWithCategory | null> => {
    try {
        const cached = await getCache<ServiceWithCategory>(CACHE_KEYS.SERVICE_BY_ID(serviceId))
        if (cached) {
            logger.info(`Service with id: ${serviceId} served from cache`)
            return cached
        }
        const pool = getPool()
        const result = await pool.query(
            `
            SELECT
                services.*,
                categories.name AS category_name,
                categories.description AS category_description
            FROM services
            LEFT JOIN categories ON services.category_id = categories.id
            WHERE services.id=$1
            `,
            [serviceId],
        )

        const service = result.rows[0] || null
        if (service) {
            await setCache(CACHE_KEYS.SERVICE_BY_ID(serviceId), service, CACHE_TTL.SERVICES)
        }
        return service
    } catch (error) {
        logger.error('findServiceById error', { error })
        throw error
    }
}

export const insertService = async (input: CreateService): Promise<Service | null> => {
    const pool = getPool()
    const result = await pool.query(
        `
        INSERT INTO services (name, image, description, category_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [input.name, input.image, input.description, input.category_id],
    )
    await deleteCachePattern('services:all:*')
    return result.rows[0] || null
}

export const modifyService = async (serviceId: string, update: CreateService): Promise<Service | null> => {
    await deleteCachePattern('services:all:*')
    await deleteCache(CACHE_KEYS.SERVICE_BY_ID(serviceId))

    const fields = []
    const values = []
    let index = 1

    if (update.name) {
        fields.push(`name = $${index++}`)
        values.push(update.name)
    }

    if (update.image) {
        fields.push(`image = $${index++}`)
        values.push(update.image)
    }

    if (update.description) {
        fields.push(`description = $${index++}`)
        values.push(update.description)
    }

    if (update.category_id) {
        fields.push(`category_id = $${index++}`)
        values.push(update.category_id)
    }

    values.push(serviceId)

    const pool = getPool()
    const result = await pool.query(
        `
        UPDATE services
        SET ${fields.join(', ')}
        WHERE id=$${index}
        RETURNING *
        `,
        values,
    )

    await setCache(CACHE_KEYS.SERVICE_BY_ID(serviceId), result.rows[0], CACHE_TTL.SERVICES)
    return result.rows[0] || null
}

export const deleteService = async (serviceId: string): Promise<Service | null> => {
    const pool = getPool()
    const result = await pool.query(
        `DELETE FROM services WHERE id=$1 RETURNING *`,
        [serviceId],
    )
    await deleteCachePattern('services:all:*')
    await deleteCache(CACHE_KEYS.SERVICE_BY_ID(serviceId))
    return result.rows[0] || null
}
