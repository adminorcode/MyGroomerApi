import { SQL, sql as drizzleSql } from 'drizzle-orm'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { PoolClient, QueryResult, QueryResultRow } from 'pg'
import { getPool } from '../../config/database.config'

export type AppDatabase = NodePgDatabase

const INSTANT_COLUMNS = new Set([
    'created_at',
    'updated_at',
    'email_verified_at',
    'email_verification_token_expires_at',
    'forgot_password_token_expires_at',
    'terms_accepted_at',
    'scheduled_at',
    'completed_at',
    'payment_date',
    'timestamp',
    'provider_rejected_at',
    'starts_at',
    'ends_at',
    'last_message_at',
])

const reviveInstants = <T extends QueryResultRow>(row: T): T => {
    const copy = { ...row } as Record<string, unknown>
    for (const key of Object.keys(copy)) {
        if (!INSTANT_COLUMNS.has(key) || typeof copy[key] !== 'string') continue
        const instant = new Date(copy[key] as string)
        if (!Number.isNaN(instant.getTime())) copy[key] = instant
    }
    return copy as T
}

export const sql: typeof drizzleSql = new Proxy(drizzleSql, {
    apply(target, thisArg, argArray: unknown[]) {
        const [strings, ...values] = argArray
        return Reflect.apply(target, thisArg, [
            strings,
            ...values.map(value => value === undefined ? null : value),
        ])
    },
})

export const getDb = (client?: PoolClient): AppDatabase => drizzle({ client: client ?? getPool() })

export const execute = async <T extends QueryResultRow = QueryResultRow>(
    client: PoolClient | undefined,
    statement: SQL,
): Promise<QueryResult<T>> => {
    const result = await getDb(client).execute(statement) as QueryResult<T>
    return {
        command: result.command,
        rowCount: result.rowCount,
        oid: result.oid,
        rows: result.rows.map(reviveInstants),
        fields: result.fields,
    }
}

export const bound = <T>(value: T) => sql.param(value)

export const col = (column: { name: string }) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(column.name)) throw new Error('Column name is not a safe identifier')
    return sql.raw(`"${column.name}"`)
}

export type DatabaseError = { code?: string, constraint?: string }

export const databaseError = (error: unknown): DatabaseError => {
    let current: unknown = error
    for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
        const candidate = current as DatabaseError & { cause?: unknown }
        if (typeof candidate.code === 'string') return candidate
        current = candidate.cause
    }
    return {}
}
