import { SQL } from 'drizzle-orm'
import { PoolClient } from 'pg'
import { logger } from '../../config/logger.config'
import { CACHE_KEYS, CACHE_TTL } from '../../constants'
import { deleteCache, deleteCachePattern, getCache, setCache } from '../../shared/cache/cache'
import { withTransaction } from '../../shared/db/transaction'
import { col, databaseError, execute, sql } from '../../shared/db/drizzle'
import { AppError } from '../../shared/errors'
import { QueryType } from '../../types/pagination.types'
import { findCategoryById } from './category.service'
import { categories, services } from './catalog.table'
import { CreateService, Service, ServiceWithCategory, UpdateService } from './service.types'

const DUPLICATE_NAME = 'Já existe um serviço com esse nome'
const isPgCode = (error: unknown, code: string) => databaseError(error).code === code
const rejectDuplicateName = (error: unknown): never => {
    if (isPgCode(error, '23505')) throw new AppError(DUPLICATE_NAME, 409)
    throw error
}

const assertActiveCategory = async (categoryId: string) => {
    const category = await findCategoryById(categoryId)
    if (!category) throw new AppError('Categoria inválida', 400)
    if (!category.is_active) throw new AppError('A categoria precisa estar ativa', 400)
}

export const fetchAllServices = async (
    categoryId: string | undefined,
    query: QueryType,
    includeInactive = false,
): Promise<ServiceWithCategory[] | null> => {
    const conditions: SQL[] = []
    if (!includeInactive) conditions.push(sql`${services.is_active}`)
    if (categoryId) conditions.push(sql`${services.category_id} = ${categoryId}`)
    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``
    const page = query.page || 1
    const limit = query.limit || 10
    const offset = (page - 1) * limit
    const cacheKey = CACHE_KEYS.SERVICES_ALL(`${categoryId || 'all'}_page${page}_limit${limit}_${includeInactive ? 'all' : 'active'}`)
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
        ORDER BY lower(${services.name}) ASC, ${services.name} ASC
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
    await assertActiveCategory(input.category_id)
    try {
        const result = await execute<Service>(undefined, sql`
            INSERT INTO ${services} (name, image, description, category_id)
            VALUES (${input.name}, ${input.image ?? null}, ${input.description ?? null}, ${input.category_id})
            RETURNING *
        `)
        await deleteCachePattern('services:all:*')
        return result.rows[0] || null
    } catch (error) {
        return rejectDuplicateName(error)
    }
}

export const modifyService = async (serviceId: string, update: UpdateService): Promise<Service | null> => {
    if (update.category_id) await assertActiveCategory(update.category_id)
    const assignments: SQL[] = []
    if (update.name !== undefined) assignments.push(sql`${col(services.name)} = ${update.name}`)
    if (update.image !== undefined) assignments.push(sql`${col(services.image)} = ${update.image || null}`)
    if (update.description !== undefined) assignments.push(sql`${col(services.description)} = ${update.description || null}`)
    if (update.category_id !== undefined) assignments.push(sql`${col(services.category_id)} = ${update.category_id}`)
    if (update.is_active !== undefined) assignments.push(sql`${col(services.is_active)} = ${update.is_active}`)
    if (assignments.length === 0) throw new AppError('Informe pelo menos um campo', 400)
    assignments.push(sql`${col(services.updated_at)} = NOW()`)
    try {
        const result = await execute<Service>(undefined, sql`
            UPDATE ${services}
            SET ${sql.join(assignments, sql`, `)}
            WHERE ${services.id} = ${serviceId}
            RETURNING *
        `)
        await deleteCachePattern('services:all:*')
        await deleteCache(CACHE_KEYS.SERVICE_BY_ID(serviceId))
        if (result.rows[0]) await setCache(CACHE_KEYS.SERVICE_BY_ID(serviceId), result.rows[0], CACHE_TTL.SERVICES)
        return result.rows[0] || null
    } catch (error) {
        return rejectDuplicateName(error)
    }
}

export const removeService = async (serviceId: string): Promise<'deleted' | 'not_found' | 'in_use'> => {
    try {
        const result = await withTransaction(async client => {
            const existing = await execute(client, sql`
                SELECT ${services.id} AS id
                FROM ${services}
                WHERE ${services.id} = ${serviceId}
                FOR UPDATE
            `)
            if ((existing.rowCount ?? 0) === 0) return 'not_found' as const
            const linked = await execute(client, sql`
                SELECT 1 FROM provider_services WHERE service_id = ${serviceId} LIMIT 1
            `)
            if ((linked.rowCount ?? 0) > 0) return 'in_use' as const
            await execute(client, sql`DELETE FROM ${services} WHERE ${services.id} = ${serviceId}`)
            return 'deleted' as const
        })
        if (result === 'deleted') {
            await deleteCachePattern('services:all:*')
            await deleteCache(CACHE_KEYS.SERVICE_BY_ID(serviceId))
        }
        return result
    } catch (error) {
        if (isPgCode(error, '23503')) return 'in_use'
        throw error
    }
}

export const findServiceCategoryId = async (serviceId: string, client?: PoolClient) => {
    const result = await execute<{
        id: string
        category_id: string | null
        is_active: boolean
        category_is_active: boolean | null
    }>(client, sql`
        SELECT
            ${services.id} AS id,
            ${services.category_id} AS category_id,
            ${services.is_active} AS is_active,
            ${categories.is_active} AS category_is_active
        FROM ${services}
        LEFT JOIN ${categories} ON ${categories.id} = ${services.category_id}
        WHERE ${services.id} = ${serviceId}
    `)
    return result.rows[0] ?? null
}
