import { SQL } from 'drizzle-orm'
import { logger } from '../../config/logger.config'
import { CACHE_KEYS, CACHE_TTL } from '../../constants'
import { deleteCache, getCache, setCache } from '../../shared/cache/cache'
import { col, execute, sql } from '../../shared/db/drizzle'
import { Category, CreateCategory } from './category.types'
import { categories } from './catalog.table'

export const insertCategory = async (input: CreateCategory): Promise<Category | null> => {
    const result = await execute<Category>(undefined, sql`
        INSERT INTO ${categories} (name, description)
        VALUES (${input.name}, ${input.description})
        RETURNING *
    `)
    await deleteCache(CACHE_KEYS.CATEGORIES_ALL)
    return result.rows[0] || null
}

export const findCategoryById = async (id: string): Promise<Category | null> => {
    try {
        const cached = await getCache<Category>(CACHE_KEYS.CATEGORY_BY_ID(id))
        if (cached) {
            logger.info(`Category with id ${id} served from cache`)
            return cached
        }
        const result = await execute<Category>(undefined, sql`
            SELECT * FROM ${categories} WHERE ${categories.id} = ${id}
        `)
        const category = result.rows[0] || null
        if (category) {
            await setCache(CACHE_KEYS.CATEGORY_BY_ID(id), category, CACHE_TTL.CATEGORIES)
        }
        return category
    } catch (error) {
        logger.error('findCategoryById error', { error })
        throw error
    }
}

export const fetchAllCategories = async (): Promise<Category[] | null> => {
    const cached = await getCache<Category[]>(CACHE_KEYS.CATEGORIES_ALL)
    if (cached) {
        logger.info('Categories served from cache')
        return cached
    }
    const result = await execute<Category>(undefined, sql`SELECT * FROM ${categories}`)
    await setCache(CACHE_KEYS.CATEGORIES_ALL, result.rows, CACHE_TTL.CATEGORIES)
    return result.rows || null
}

export const modifyCategory = async (id: string, update: CreateCategory): Promise<Category | null> => {
    await deleteCache(CACHE_KEYS.CATEGORIES_ALL)
    await deleteCache(CACHE_KEYS.CATEGORY_BY_ID(id))
    const assignments: SQL[] = []
    if (update.name) assignments.push(sql`${col(categories.name)} = ${update.name}`)
    if (update.description) assignments.push(sql`${col(categories.description)} = ${update.description}`)
    if (assignments.length === 0) throw new Error('No fields to update')
    const result = await execute<Category>(undefined, sql`
        UPDATE ${categories}
        SET ${sql.join(assignments, sql`, `)}
        WHERE ${categories.id} = ${id}
        RETURNING *
    `)
    await setCache(CACHE_KEYS.CATEGORY_BY_ID(id), result.rows[0], CACHE_TTL.CATEGORIES)
    return result.rows[0] || null
}

export const deleteCategory = async (id: string): Promise<Category | null> => {
    const result = await execute<Category>(undefined, sql`
        DELETE FROM ${categories} WHERE ${categories.id} = ${id} RETURNING *
    `)
    await deleteCache(CACHE_KEYS.CATEGORIES_ALL)
    await deleteCache(CACHE_KEYS.CATEGORY_BY_ID(id))
    return result.rows[0] || null
}

export const categoryExists = async (categoryId: string, client?: Parameters<typeof execute>[0]) => {
    const result = await execute(client, sql`
        SELECT ${categories.id} AS id FROM ${categories} WHERE ${categories.id} = ${categoryId}
    `)
    return (result.rowCount ?? 0) > 0
}
