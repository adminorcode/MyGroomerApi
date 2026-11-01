import { SQL } from 'drizzle-orm'
import { PoolClient } from 'pg'
import { logger } from '../../config/logger.config'
import { CACHE_KEYS, CACHE_TTL } from '../../constants'
import { deleteCache, deleteCachePattern, getCache, setCache } from '../../shared/cache/cache'
import { col, execute, sql } from '../../shared/db/drizzle'
import { QueryType } from '../../types/pagination.types'
import { categories, services } from './catalog.table'
import { CreateService, Service, ServiceWithCategory } from './service.types'

export const fetchAllServices = async (categoryId: string | undefined, query: QueryType): Promise<ServiceWithCategory[] | null> => {
    const conditions: SQL[] = []
    if (categoryId) conditions.push(sql`${services.category_id} = ${categoryId}`)
    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``
    const page = query.page || 1
    const limit = query.limit || 10
    const offset = (page - 1) * limit
    const cacheKey = CACHE_KEYS.SERVICES_ALL(`${categoryId || 'all'}_page${page}_limit${limit}`)
    const cached = await getCache<ServiceWithCategory[]>(cacheKey)
    if (cached) {
        logger.info('Services served from cache')
        return cached
    }
    const result = await execute<ServiceWithCategory>(undefined, sql`
        SELECT
            ${services}.*,
            ${categories.name} AS category_name,
            ${categories.description} AS category_description
        FROM ${services}
        LEFT JOIN ${categories} ON ${services.category_id} = ${categories.id}
        ${whereClause}
        LIMIT ${limit} OFFSET ${offset}
    `)
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
        const result = await execute<ServiceWithCategory>(undefined, sql`
            SELECT
                ${services}.*,
                ${categories.name} AS category_name,
                ${categories.description} AS category_description
            FROM ${services}
            LEFT JOIN ${categories} ON ${services.category_id} = ${categories.id}
            WHERE ${services.id} = ${serviceId}
        `)
        const service = result.rows[0] || null
        if (service) await setCache(CACHE_KEYS.SERVICE_BY_ID(serviceId), service, CACHE_TTL.SERVICES)
        return service
    } catch (error) {
        logger.error('findServiceById error', { error })
        throw error
    }
}

export const insertService = async (input: CreateService): Promise<Service | null> => {
    const result = await execute<Service>(undefined, sql`
        INSERT INTO ${services} (name, image, description, category_id)
        VALUES (${input.name}, ${input.image}, ${input.description}, ${input.category_id})
        RETURNING *
    `)
    await deleteCachePattern('services:all:*')
    return result.rows[0] || null
}

export const modifyService = async (serviceId: string, update: CreateService): Promise<Service | null> => {
    await deleteCachePattern('services:all:*')
    await deleteCache(CACHE_KEYS.SERVICE_BY_ID(serviceId))
    const assignments: SQL[] = []
    if (update.name) assignments.push(sql`${col(services.name)} = ${update.name}`)
    if (update.image) assignments.push(sql`${col(services.image)} = ${update.image}`)
    if (update.description) assignments.push(sql`${col(services.description)} = ${update.description}`)
    if (update.category_id) assignments.push(sql`${col(services.category_id)} = ${update.category_id}`)
    const result = await execute<Service>(undefined, sql`
        UPDATE ${services}
        SET ${sql.join(assignments, sql`, `)}
        WHERE ${services.id} = ${serviceId}
        RETURNING *
    `)
    await setCache(CACHE_KEYS.SERVICE_BY_ID(serviceId), result.rows[0], CACHE_TTL.SERVICES)
    return result.rows[0] || null
}

export const deleteService = async (serviceId: string): Promise<Service | null> => {
    const result = await execute<Service>(undefined, sql`
        DELETE FROM ${services} WHERE ${services.id} = ${serviceId} RETURNING *
    `)
    await deleteCachePattern('services:all:*')
    await deleteCache(CACHE_KEYS.SERVICE_BY_ID(serviceId))
    return result.rows[0] || null
}

export const findServiceCategoryId = async (serviceId: string, client?: PoolClient) => {
    const result = await execute<{ id: string, category_id: string | null }>(client, sql`
        SELECT ${services.id} AS id, ${services.category_id} AS category_id
        FROM ${services}
        WHERE ${services.id} = ${serviceId}
    `)
    return result.rows[0] ?? null
}
