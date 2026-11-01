import { randomUUID } from 'crypto'
import { PoolClient } from 'pg'
import { executor, withTransaction } from '../../shared/db/transaction'
import { AppError } from '../../shared/errors'
import { OccupiedInterval } from './weekly-availability.slots'

export const lockProviderAgenda = async (providerId: string, client: PoolClient): Promise<void> => {
    const result = await client.query('SELECT id FROM providers WHERE id = $1 FOR UPDATE', [providerId])
    if (!result.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
}

/**
 * Relative minutes preserve cross-midnight intervals and sub-minute boundaries.
 * Legacy reservations have no reliable duration: 600 minutes is the maximum
 * publishable duration, used conservatively without rewriting their history.
 */
export const readAgendaOccupancy = async (
    providerId: string,
    date: string,
    client?: PoolClient,
): Promise<OccupiedInterval[]> => {
    const origin = new Date(`${date}T00:00:00-03:00`).getTime()
    const rows = await executor(client).query(
        `SELECT starts_at, ends_at, travel FROM (
            SELECT b.scheduled_at AS starts_at,
                   b.scheduled_at + make_interval(mins => COALESCE(b.duration_minutes, 600)) AS ends_at,
                   true AS travel
            FROM bookings b JOIN provider_services ps ON ps.id = b.provider_service_id
            WHERE ps.provider_id = $1 AND b.booking_status IS DISTINCT FROM 'cancelled'
            UNION ALL
            SELECT starts_at, ends_at, true FROM provider_manual_appointments WHERE provider_id = $1
            UNION ALL
            SELECT starts_at, ends_at, false FROM provider_agenda_blocks WHERE provider_id = $1
         ) occupied
         WHERE starts_at < $2::timestamptz + interval '1 day 2 hours'
           AND ends_at > $2::timestamptz - interval '2 hours'`,
        [providerId, new Date(origin).toISOString()],
    )
    return rows.rows.map(row => ({
        start: (new Date(row.starts_at).getTime() - origin) / 60000,
        end: (new Date(row.ends_at).getTime() - origin) / 60000,
        travel: row.travel,
    }))
}

export type AgendaBlockInput = { starts_at: string, ends_at: string }

export const listAgendaBlocks = async (providerId: string) => {
    const result = await executor().query(
        'SELECT id, starts_at, ends_at FROM provider_agenda_blocks WHERE provider_id = $1 ORDER BY starts_at',
        [providerId],
    )
    return result.rows
}

export const createAgendaBlock = async (providerId: string, input: AgendaBlockInput) => {
    const starts = new Date(input.starts_at)
    const ends = new Date(input.ends_at)
    if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) {
        throw new AppError('O fim do bloqueio precisa ser depois do início.', 400)
    }
    return withTransaction(async client => {
        await lockProviderAgenda(providerId, client)
        const result = await client.query(
            `INSERT INTO provider_agenda_blocks(id, provider_id, starts_at, ends_at)
             VALUES ($1,$2,$3,$4) RETURNING id, starts_at, ends_at`,
            [randomUUID(), providerId, starts.toISOString(), ends.toISOString()],
        )
        return result.rows[0]
    })
}

export const deleteAgendaBlock = async (providerId: string, blockId: string): Promise<void> => {
    await withTransaction(async client => {
        await lockProviderAgenda(providerId, client)
        const result = await client.query(
            'DELETE FROM provider_agenda_blocks WHERE id = $1 AND provider_id = $2 RETURNING id',
            [blockId, providerId],
        )
        if (!result.rowCount) throw new AppError('Bloqueio não encontrado', 404)
    })
}
