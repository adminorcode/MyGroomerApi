import { getPool } from '../../config/database.config'
import { withTransaction } from '../../shared/db/transaction'
import { AppError } from '../../shared/errors'
import { CreateProfessionalTypeInput, ProfessionalType, UpdateProfessionalTypeInput } from './professional-type.types'

const DUPLICATE_NAME = 'Já existe um tipo com esse nome'

const isPgCode = (error: unknown, code: string) =>
    typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === code

const rejectDuplicateName = (error: unknown): never => {
    if (isPgCode(error, '23505')) throw new AppError(DUPLICATE_NAME, 409)
    throw error
}

export const insertProfessionalType = async (input: CreateProfessionalTypeInput): Promise<ProfessionalType | null> => {
    try {
        const result = await getPool().query(
            `INSERT INTO professional_types (name)
             VALUES ($1)
             RETURNING id, name, is_active, created_at, updated_at`,
            [input.name],
        )
        return result.rows[0] || null
    } catch (error) {
        return rejectDuplicateName(error)
    }
}

export const listProfessionalTypes = async (includeInactive: boolean): Promise<ProfessionalType[]> => {
    const result = await getPool().query(
        `SELECT id, name, is_active, created_at, updated_at
         FROM professional_types
         WHERE ($1::boolean IS TRUE OR is_active)
         ORDER BY lower(name) ASC, name ASC`,
        [includeInactive],
    )
    return result.rows
}

export const modifyProfessionalType = async (
    id: string,
    input: UpdateProfessionalTypeInput,
): Promise<ProfessionalType | null> => {
    const fields: string[] = []
    const values: Array<string | boolean> = []
    let index = 1

    if (input.name !== undefined) {
        fields.push(`name = $${index++}`)
        values.push(input.name)
    }

    if (input.is_active !== undefined) {
        fields.push(`is_active = $${index++}`)
        values.push(input.is_active)
    }

    fields.push('updated_at = NOW()')
    values.push(id)

    try {
        const result = await getPool().query(
            `UPDATE professional_types
             SET ${fields.join(', ')}
             WHERE id = $${index}
             RETURNING id, name, is_active, created_at, updated_at`,
            values,
        )
        return result.rows[0] || null
    } catch (error) {
        return rejectDuplicateName(error)
    }
}

export const removeProfessionalType = async (id: string): Promise<'deleted' | 'not_found' | 'in_use'> => {
    try {
        return await withTransaction(async client => {
            const existing = await client.query(
                `SELECT id FROM professional_types WHERE id = $1 FOR UPDATE`,
                [id],
            )
            if ((existing.rowCount ?? 0) === 0) return 'not_found'

            const linked = await client.query(
                `SELECT 1 FROM provider_professional_types WHERE professional_type_id = $1
                 UNION ALL
                 SELECT 1 FROM provider_services WHERE professional_type_id = $1
                 LIMIT 1`,
                [id],
            )
            if ((linked.rowCount ?? 0) > 0) return 'in_use'

            await client.query(`DELETE FROM professional_types WHERE id = $1`, [id])
            return 'deleted'
        })
    } catch (error) {
        if (isPgCode(error, '23503')) return 'in_use'
        throw error
    }
}
