import { getPool } from '../../config/database.config'
import { logger } from '../../config/logger.config'
import { CACHE_KEYS, CACHE_TTL } from '../../constants'
import { deleteCache, getCache, setCache } from '../../shared/cache/cache'
import { Category, CreateCategory } from './category.types'

export const insertCategory = async (input: CreateCategory): Promise<Category | null> => {
    const pool = getPool()
    const result = await pool.query(
        `
        INSERT INTO categories (name, description)
        VALUES ($1, $2)
        RETURNING *
        `,
        [input.name, input.description],
    )

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
        const pool = getPool()
        const result = await pool.query(`SELECT * FROM categories WHERE id=$1`, [id])
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

    const pool = getPool()
    const result = await pool.query(`SELECT * FROM categories`)
    await setCache(CACHE_KEYS.CATEGORIES_ALL, result.rows, CACHE_TTL.CATEGORIES)
    return result.rows || null
}

export const modifyCategory = async (id: string, update: CreateCategory): Promise<Category | null> => {
    await deleteCache(CACHE_KEYS.CATEGORIES_ALL)
    await deleteCache(CACHE_KEYS.CATEGORY_BY_ID(id))

    const pool = getPool()
    const fields = []
    const values = []
    let index = 1

    if (update.name) {
        fields.push(`name = $${index++}`)
        values.push(update.name)
    }

    if (update.description) {
        fields.push(`description = $${index++}`)
        values.push(update.description)
    }

    values.push(id)

    if (fields.length === 0) {
        throw new Error('No fields to update')
    }

    const result = await pool.query(
        `
        UPDATE categories
        SET ${fields.join(', ')}
        WHERE id=$${index}
        RETURNING *
        `,
        values,
    )

    await setCache(CACHE_KEYS.CATEGORY_BY_ID(id), result.rows[0], CACHE_TTL.CATEGORIES)
    return result.rows[0] || null
}

export const deleteCategory = async (id: string): Promise<Category | null> => {
    const pool = getPool()
    const result = await pool.query(
        `DELETE FROM categories WHERE id=$1 RETURNING *`,
        [id],
    )

    await deleteCache(CACHE_KEYS.CATEGORIES_ALL)
    await deleteCache(CACHE_KEYS.CATEGORY_BY_ID(id))
    return result.rows[0] || null
}
