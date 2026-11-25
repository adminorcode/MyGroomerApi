import { SQL } from 'drizzle-orm'
import { PoolClient } from 'pg'
import { CACHE_KEYS, CACHE_TTL } from '../../constants'
import { deleteCache, deleteCachePattern, getCache, setCache } from '../../shared/cache/cache'
import { withTransaction } from '../../shared/db/transaction'
import { col, databaseError, execute, sql } from '../../shared/db/drizzle'
import { AppError } from '../../shared/errors'
import { categories } from './catalog.table'
import { Category, CreateCategory, UpdateCategory } from './category.types'

const DUPLICATE_NAME = 'Já existe uma categoria com esse nome'

const isPgCode = (error: unknown, code: string) => databaseError(error).code === code

const rejectDuplicateName = (error: unknown): never => {
    if (isPgCode(error, '23505')) throw new AppError(DUPLICATE_NAME, 409)
    throw error
}

const clearCategoryCache = async (id?: string) => {
    await deleteCache(CACHE_KEYS.CATEGORIES_ALL)
    if (id) await deleteCache(CACHE_KEYS.CATEGORY_BY_ID(id))
    await deleteCachePattern('services:all:*')
}

export const insertCategory = async (input: CreateCategory): Promise<Category | null> => {
    try {
        const result = await execute<Category>(undefined, sql`
            INSERT INTO ${categories} (name, description)
            VALUES (${input.name}, ${input.description ?? null})
            RETURNING *
        `)
        await clearCategoryCache()
        return result.rows[0] || null
    } catch (error) {
        return rejectDuplicateName(error)
    }
}

export const findCategoryById = async (id: string): Promise<Category | null> => {
    const cached = await getCache<Category>(CACHE_KEYS.CATEGORY_BY_ID(id))
    if (cached && typeof cached.is_active === 'boolean') return cached
    const result = await execute<Category>(undefined, sql`
        SELECT * FROM ${categories} WHERE ${categories.id} = ${id}
    `)
    const category = result.rows[0] || null
    if (category) await setCache(CACHE_KEYS.CATEGORY_BY_ID(id), category, CACHE_TTL.CATEGORIES)
    return category
}

export const findCategoryForMenu = async (categoryId: string, client?: PoolClient) => {
    const result = await execute<{ id: string, is_active: boolean }>(client, sql`
        SELECT ${categories.id} AS id, ${categories.is_active} AS is_active
        FROM ${categories}
        WHERE ${categories.id} = ${categoryId}
    `)
    return result.rows[0] ?? null
}

export const fetchAllCategories = async (includeInactive: boolean): Promise<Category[]> => {
    if (!includeInactive) {
        const cached = await getCache<Category[]>(CACHE_KEYS.CATEGORIES_ALL)
        if (cached?.every(category => typeof category.is_active === 'boolean')) return cached
    }
    const result = await execute<Category>(undefined, sql`
        SELECT * FROM ${categories}
        WHERE (${includeInactive}::boolean IS TRUE OR ${categories.is_active})
        ORDER BY lower(${categories.name}) ASC, ${categories.name} ASC
    `)
    if (!includeInactive) await setCache(CACHE_KEYS.CATEGORIES_ALL, result.rows, CACHE_TTL.CATEGORIES)
    return result.rows
}

export const modifyCategory = async (id: string, update: UpdateCategory): Promise<Category | null> => {
    const assignments: SQL[] = []
    if (update.name !== undefined) assignments.push(sql`${col(categories.name)} = ${update.name}`)
    if (update.description !== undefined) assignments.push(sql`${col(categories.description)} = ${update.description || null}`)
    if (update.is_active !== undefined) assignments.push(sql`${col(categories.is_active)} = ${update.is_active}`)
    if (assignments.length === 0) throw new AppError('Informe pelo menos um campo', 400)
    assignments.push(sql`${col(categories.updated_at)} = NOW()`)
    try {
        const result = await execute<Category>(undefined, sql`
            UPDATE ${categories}
            SET ${sql.join(assignments, sql`, `)}
            WHERE ${categories.id} = ${id}
            RETURNING *
        `)
        await clearCategoryCache(id)
        if (result.rows[0]) await setCache(CACHE_KEYS.CATEGORY_BY_ID(id), result.rows[0], CACHE_TTL.CATEGORIES)
        return result.rows[0] || null
    } catch (error) {
        return rejectDuplicateName(error)
    }
}

export const removeCategory = async (id: string): Promise<'deleted' | 'not_found' | 'in_use'> => {
    try {
        const result = await withTransaction(async client => {
            const existing = await execute(client, sql`
                SELECT ${categories.id} AS id
                FROM ${categories}
                WHERE ${categories.id} = ${id}
                FOR UPDATE
            `)
            if ((existing.rowCount ?? 0) === 0) return 'not_found' as const
            const linked = await execute(client, sql`
                SELECT 1 FROM services WHERE category_id = ${id} LIMIT 1
            `)
            if ((linked.rowCount ?? 0) > 0) return 'in_use' as const
            await execute(client, sql`DELETE FROM ${categories} WHERE ${categories.id} = ${id}`)
            return 'deleted' as const
        })
        if (result === 'deleted') await clearCategoryCache(id)
        return result
    } catch (error) {
        if (isPgCode(error, '23503')) return 'in_use'
        throw error
    }
}
