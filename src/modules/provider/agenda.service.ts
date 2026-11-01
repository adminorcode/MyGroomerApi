import { randomUUID } from 'crypto'
import { PoolClient } from 'pg'
import { executor, withTransaction } from '../../shared/db/transaction'
import { AppError } from '../../shared/errors'
import { OccupiedInterval } from './weekly-availability.slots'
import { buildAgenda, parseAgendaWindow } from './agenda.window'

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

export const listProviderAgenda = async (providerId: string, from: string, to: string) => {
    const window = parseAgendaWindow(from, to)
    const bounds = [providerId, window.from.toISOString(), window.to.toISOString()]
    const db = executor()
    const [appointments, blocks, manualAppointments] = await Promise.all([
        db.query(
            `SELECT bookings.id,
                    bookings.scheduled_at,
                    bookings.duration_minutes,
                    bookings.booking_status,
                    customer_users.name AS customer_name,
                    bookings.customer_location,
                    services.name AS service_name,
                    pets.name AS pet_name,
                    pets.photo_url AS pet_photo_url
             FROM bookings
             JOIN provider_services ON provider_services.id = bookings.provider_service_id
             LEFT JOIN services ON services.id = provider_services.service_id
             LEFT JOIN pets ON pets.id = bookings.pet_id
             LEFT JOIN users AS customer_users ON customer_users.id = bookings.customer_id
             WHERE provider_services.provider_id = $1
               AND bookings.booking_status IS DISTINCT FROM 'cancelled'
               AND bookings.scheduled_at >= $2::timestamptz
               AND bookings.scheduled_at < $3::timestamptz
             ORDER BY bookings.scheduled_at`,
            bounds,
        ),
        db.query(
            `SELECT id, starts_at, ends_at
             FROM provider_agenda_blocks
             WHERE provider_id = $1
               AND starts_at < $3::timestamptz
               AND ends_at > $2::timestamptz
             ORDER BY starts_at`,
            bounds,
        ),
        db.query(
            `SELECT id, starts_at, ends_at
             FROM provider_manual_appointments
             WHERE provider_id = $1
               AND starts_at < $3::timestamptz
               AND ends_at > $2::timestamptz
             ORDER BY starts_at`,
            bounds,
        ),
    ])
    return buildAgenda(window, {
        appointments: appointments.rows,
        blocks: blocks.rows,
        manualAppointments: manualAppointments.rows,
    })
}

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
