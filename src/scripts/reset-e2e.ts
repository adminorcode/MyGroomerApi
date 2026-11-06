import { Pool } from 'pg'
import Redis from 'ioredis'
import { assertE2eDatabase } from '../config/runtime.config'
import { seedLocal } from './seed-local'

const tutorId = '10000000-0000-4000-8000-000000000001'
const petId = '10000000-0000-4000-8000-000000000060'

const reset = async () => {
    assertE2eDatabase()
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const client = await pool.connect()
    try {
        const tables = await client.query<{ tablename: string }>(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' ORDER BY tablename"
        )
        if (!tables.rowCount) throw new Error('mygroomer_e2e has no tables. Apply migrations before the reset.')
        const names = tables.rows.map(row => {
            if (!/^[a-z_][a-z0-9_]*$/.test(row.tablename)) throw new Error('Unexpected table name in mygroomer_e2e')
            return `"public"."${row.tablename}"`
        })
        await client.query('BEGIN')
        await client.query(`TRUNCATE ${names.join(', ')} RESTART IDENTITY CASCADE`)
        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
    } finally {
        client.release()
        await pool.end()
    }

    await seedLocal()

    const pets = new Pool({ connectionString: process.env.DATABASE_URL })
    try {
        await pets.query(
            `INSERT INTO pets (id, owner_id, name, species, breed, size, age_years)
             VALUES ($1, $2, 'Josefino', 'dog', 'SRD', 'small', 4)
             ON CONFLICT (id) DO NOTHING`,
            [petId, tutorId]
        )
    } finally {
        await pets.end()
    }

    if (!process.env.REDIS_URL?.trim()) throw new Error('REDIS_URL is required to clear the e2e cache')
    const redisHost = new URL(process.env.REDIS_URL).hostname
    if (!['localhost', '127.0.0.1', '[::1]'].includes(redisHost)) {
        throw new Error('E2E cache reset refused a non-local Redis')
    }
    const redis = new Redis(process.env.REDIS_URL)
    try {
        await redis.flushdb()
    } finally {
        redis.disconnect()
    }
    console.log('E2E database reset to the local seed. Cache cleared.')
}

reset().catch(error => {
    console.error(`E2E reset failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
})
