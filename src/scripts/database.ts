import 'dotenv/config'
import { Pool, PoolClient } from 'pg'

export const withDatabaseTransaction = async (operation: (client: PoolClient) => Promise<void>) => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await operation(client)
        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally {
        client.release()
        await pool.end()
    }
}
