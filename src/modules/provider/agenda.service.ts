import { randomUUID } from 'crypto'
import { execute, sql } from '../../shared/db/drizzle'
import { PoolClient } from 'pg'
import { withTransaction } from '../../shared/db/transaction'
import { AppError } from '../../shared/errors'
import { OccupiedInterval } from './weekly-availability.slots'
import { buildAgenda, parseAgendaWindow, AgendaAppointmentSource, AgendaIntervalSource } from './agenda.window'
import { providerAgendaBlocks, providerManualAppointments, providerServices, providers } from './provider.table'

export const lockProviderAgenda = async (providerId: string, client: PoolClient): Promise<void> => {
    const result = await execute(client, sql`
        SELECT ${providers.id} AS id FROM ${providers} WHERE ${providers.id} = ${providerId} FOR UPDATE
    `)
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
    excludeBookingId?: string,
): Promise<OccupiedInterval[]> => {
    const origin = new Date(`${date}T00:00:00-03:00`).getTime()
    const originIso = new Date(origin).toISOString()
    const excludeFilter = excludeBookingId
        ? sql` AND b.id <> ${excludeBookingId}`
        : sql``
    const rows = await execute<{ starts_at: Date | string, ends_at: Date | string, travel: boolean }>(client, sql`
        SELECT starts_at, ends_at, travel FROM (
            SELECT b.scheduled_at AS starts_at,
                   b.scheduled_at + make_interval(mins => COALESCE(b.duration_minutes, 600)) AS ends_at,
                   true AS travel
            FROM bookings b JOIN ${providerServices} ps ON ps.id = b.provider_service_id
            WHERE ps.provider_id = ${providerId} AND b.booking_status IS DISTINCT FROM 'cancelled'${excludeFilter}
            UNION ALL
            SELECT starts_at, ends_at, true FROM ${providerManualAppointments} WHERE provider_id = ${providerId}
            UNION ALL
            SELECT starts_at, ends_at, false FROM ${providerAgendaBlocks} WHERE provider_id = ${providerId}
         ) occupied
         WHERE starts_at < ${originIso}::timestamptz + interval '1 day 2 hours'
           AND ends_at > ${originIso}::timestamptz - interval '2 hours'
    `)
    return rows.rows.map(row => ({
        start: (new Date(row.starts_at).getTime() - origin) / 60000,
        end: (new Date(row.ends_at).getTime() - origin) / 60000,
        travel: row.travel,
    }))
}

export type AgendaBlockInput = { starts_at: string, ends_at: string }

export const listProviderAgenda = async (providerId: string, from: string, to: string) => {
    const window = parseAgendaWindow(from, to)
    const fromIso = window.from.toISOString()
    const toIso = window.to.toISOString()
    const [appointments, blocks, manualAppointments] = await Promise.all([
        execute<AgendaAppointmentSource>(undefined, sql`
            SELECT bookings.id,
                    bookings.scheduled_at,
                    bookings.duration_minutes,
                    bookings.booking_status,
                    customer_users.name AS customer_name,
                    bookings.customer_location,
                    services.name AS service_name,
                    pets.name AS pet_name,
                    pets.photo_url AS pet_photo_url
             FROM bookings
             JOIN ${providerServices} ON provider_services.id = bookings.provider_service_id
             LEFT JOIN services ON services.id = provider_services.service_id
             LEFT JOIN pets ON pets.id = bookings.pet_id
             LEFT JOIN users AS customer_users ON customer_users.id = bookings.customer_id
             WHERE provider_services.provider_id = ${providerId}
               AND bookings.booking_status IS DISTINCT FROM 'cancelled'
               AND bookings.scheduled_at >= ${fromIso}::timestamptz
               AND bookings.scheduled_at < ${toIso}::timestamptz
             ORDER BY bookings.scheduled_at
        `),
        execute<AgendaIntervalSource>(undefined, sql`
            SELECT id, starts_at, ends_at
            FROM ${providerAgendaBlocks}
            WHERE provider_id = ${providerId}
              AND starts_at < ${toIso}::timestamptz
              AND ends_at > ${fromIso}::timestamptz
            ORDER BY starts_at
        `),
        execute<AgendaIntervalSource>(undefined, sql`
            SELECT id, starts_at, ends_at
            FROM ${providerManualAppointments}
            WHERE provider_id = ${providerId}
              AND starts_at < ${toIso}::timestamptz
              AND ends_at > ${fromIso}::timestamptz
            ORDER BY starts_at
        `),
    ])
    return buildAgenda(window, {
        appointments: appointments.rows,
        blocks: blocks.rows,
        manualAppointments: manualAppointments.rows,
    })
}

export const listAgendaBlocks = async (providerId: string) => {
    const result = await execute(undefined, sql`
        SELECT id, starts_at, ends_at FROM ${providerAgendaBlocks}
        WHERE ${providerAgendaBlocks.provider_id} = ${providerId}
        ORDER BY starts_at
    `)
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
        const result = await execute(client, sql`
            INSERT INTO ${providerAgendaBlocks}(id, provider_id, starts_at, ends_at)
            VALUES (${randomUUID()}, ${providerId}, ${starts.toISOString()}, ${ends.toISOString()})
            RETURNING id, starts_at, ends_at
        `)
        return result.rows[0]
    })
}

export const deleteAgendaBlock = async (providerId: string, blockId: string): Promise<void> => {
    await withTransaction(async client => {
        await lockProviderAgenda(providerId, client)
        const result = await execute(client, sql`
            DELETE FROM ${providerAgendaBlocks}
            WHERE ${providerAgendaBlocks.id} = ${blockId} AND ${providerAgendaBlocks.provider_id} = ${providerId}
            RETURNING id
        `)
        if (!result.rowCount) throw new AppError('Bloqueio não encontrado', 404)
    })
}
