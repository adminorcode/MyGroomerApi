import { SQL } from 'drizzle-orm'
import { PoolClient } from 'pg'
import { withTransaction } from '../../shared/db/transaction'
import { bound, col, databaseError, execute, sql } from '../../shared/db/drizzle'
import { AppError } from '../../shared/errors'
import { professionalTypeHasOffers } from '../provider/provider.service'
import { CreateProfessionalTypeInput, ProfessionalType, UpdateProfessionalTypeInput } from './professional-type.types'
import { professionalTypes, providerProfessionalTypes } from './professional-type.table'

const DUPLICATE_NAME = 'Já existe um tipo com esse nome'

const isPgCode = (error: unknown, code: string) => databaseError(error).code === code

const rejectDuplicateName = (error: unknown): never => {
    if (isPgCode(error, '23505')) throw new AppError(DUPLICATE_NAME, 409)
    throw error
}

export const insertProfessionalType = async (input: CreateProfessionalTypeInput): Promise<ProfessionalType | null> => {
    try {
        const result = await execute<ProfessionalType>(undefined, sql`
            INSERT INTO ${professionalTypes} (name)
            VALUES (${input.name})
            RETURNING id, name, is_active, created_at, updated_at
        `)
        return result.rows[0] || null
    } catch (error) {
        return rejectDuplicateName(error)
    }
}

export const listProfessionalTypes = async (includeInactive: boolean): Promise<ProfessionalType[]> => {
    const result = await execute<ProfessionalType>(undefined, sql`
        SELECT id, name, is_active, created_at, updated_at
        FROM ${professionalTypes}
        WHERE (${includeInactive}::boolean IS TRUE OR ${professionalTypes.is_active})
        ORDER BY lower(${professionalTypes.name}) ASC, ${professionalTypes.name} ASC
    `)
    return result.rows
}

export const modifyProfessionalType = async (
    id: string,
    input: UpdateProfessionalTypeInput,
): Promise<ProfessionalType | null> => {
    const assignments: SQL[] = []
    if (input.name !== undefined) assignments.push(sql`${col(professionalTypes.name)} = ${input.name}`)
    if (input.is_active !== undefined) assignments.push(sql`${col(professionalTypes.is_active)} = ${input.is_active}`)
    assignments.push(sql`${col(professionalTypes.updated_at)} = NOW()`)
    try {
        const result = await execute<ProfessionalType>(undefined, sql`
            UPDATE ${professionalTypes}
            SET ${sql.join(assignments, sql`, `)}
            WHERE ${professionalTypes.id} = ${id}
            RETURNING id, name, is_active, created_at, updated_at
        `)
        return result.rows[0] || null
    } catch (error) {
        return rejectDuplicateName(error)
    }
}

export const shareActiveProfessionalTypes = async (client: PoolClient, ids: string[]) => {
    const result = await execute(client, sql`
        SELECT ${professionalTypes.id} AS id
        FROM ${professionalTypes}
        WHERE ${professionalTypes.id} = ANY(${bound(ids)}::uuid[])
          AND ${professionalTypes.is_active}
        FOR SHARE
    `)
    return result.rowCount
}

export const replaceProviderProfessionalTypes = async (client: PoolClient, providerId: string, ids: string[]) => {
    await execute(client, sql`
        DELETE FROM ${providerProfessionalTypes}
        WHERE ${providerProfessionalTypes.provider_id} = ${providerId}
          AND NOT (${providerProfessionalTypes.professional_type_id} = ANY(${bound(ids)}::uuid[]))
    `)
    await execute(client, sql`
        INSERT INTO ${providerProfessionalTypes}(provider_id, professional_type_id)
        SELECT ${providerId}, unnest(${bound(ids)}::uuid[])
        ON CONFLICT DO NOTHING
    `)
}

export const findProviderTypeLink = async (client: PoolClient, typeId: string, providerId: string) => {
    const result = await execute<{ is_active: boolean, linked: boolean }>(client, sql`
        SELECT ${professionalTypes.is_active} AS is_active,
            EXISTS (
                SELECT 1 FROM ${providerProfessionalTypes}
                WHERE ${providerProfessionalTypes.provider_id} = ${providerId}
                  AND ${providerProfessionalTypes.professional_type_id} = ${professionalTypes.id}
            ) AS linked
        FROM ${professionalTypes}
        WHERE ${professionalTypes.id} = ${typeId}
    `)
    return result.rows[0] ?? null
}

export const removeProfessionalType = async (id: string): Promise<'deleted' | 'not_found' | 'in_use'> => {
    try {
        return await withTransaction(async client => {
            const existing = await execute(client, sql`
                SELECT ${professionalTypes.id} AS id
                FROM ${professionalTypes}
                WHERE ${professionalTypes.id} = ${id}
                FOR UPDATE
            `)
            if ((existing.rowCount ?? 0) === 0) return 'not_found'
            const linked = await execute(client, sql`
                SELECT 1 FROM ${providerProfessionalTypes}
                WHERE ${providerProfessionalTypes.professional_type_id} = ${id}
                LIMIT 1
            `)
            if ((linked.rowCount ?? 0) > 0 || await professionalTypeHasOffers(id, client)) return 'in_use'
            await execute(client, sql`DELETE FROM ${professionalTypes} WHERE ${professionalTypes.id} = ${id}`)
            return 'deleted'
        })
    } catch (error) {
        if (isPgCode(error, '23503')) return 'in_use'
        throw error
    }
}
