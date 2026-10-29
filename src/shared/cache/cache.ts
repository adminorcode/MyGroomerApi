import { logger } from '../../config/logger.config'
import { getRedis } from '../../config/redis.config'

export const getCache = async <T>(key: string): Promise<T | null> => {
    try {
        const redis = getRedis()
        const data = await redis.get(key)
        if (!data) return null
        return JSON.parse(data) as T
    } catch (error) {
        logger.error('Cache get error', { key, error })
        return null
    }
}

export const setCache = async (key: string, data: unknown, ttlSeconds: number): Promise<void> => {
    try {
        const redis = getRedis()
        await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds)
    } catch (error) {
        logger.error('Cache set error', { key, error })
    }
}

export const deleteCache = async (key: string): Promise<void> => {
    try {
        const redis = getRedis()
        await redis.del(key)
    } catch (error) {
        logger.error('Cache delete error', { key, error })
    }
}

export const deleteCachePattern = async (pattern: string): Promise<void> => {
    try {
        const redis = getRedis()
        const keys = await redis.keys(pattern)
        if (keys.length > 0) {
            await redis.del(...keys)
        }
    } catch (error) {
        logger.error('Cache delete pattern error', { pattern, error })
    }
}
