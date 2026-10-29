import { Pool, PoolClient } from 'pg'
import { getPool } from '../../config/database.config'
import { logger } from '../../config/logger.config'

export const executor = (client?: PoolClient): Pool | PoolClient => client ?? getPool()

export const withTransaction = async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await getPool().connect()
    try {
        await client.query('BEGIN')
        const result = await operation(client)
        await client.query('COMMIT')
        return result
    } catch (error) {
        try {
            await client.query('ROLLBACK')
        } catch (rollbackError) {
            logger.error('transaction rollback failed', { error: rollbackError })
        }
        throw error
    } finally {
        client.release()
    }
}
