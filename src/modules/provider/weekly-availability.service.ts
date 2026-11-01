import { randomUUID } from 'crypto'
import { PoolClient } from 'pg'
import { AppError } from '../../shared/errors'
import { col, execute, sql } from '../../shared/db/drizzle'
import { withTransaction } from '../../shared/db/transaction'
import { lockProviderAgenda, readAgendaOccupancy } from './agenda.service'
import {
    DayWindow,
    WEEKDAY_KEYS,
    WeekdayKey,
    clockToMinutes,
    dayIssue,
    generateStartMinutes,
    intervalConflicts,
    routineCovers,
    saoPauloParts,
    slotIso,
    weekdayIndex,
    weekdayOf,
    minutesToClock,
} from './weekly-availability.slots'
import { ManualAppointmentInput, SaveWeeklyAvailabilityInput } from './provider.schemas'
import { providerManualAppointments, providerWeekdays, providers } from './provider.table'

export type WeeklyAvailability = {
    days: Record<WeekdayKey, DayWindow>
    travel_gap_minutes: number | null
    manual_fit: boolean
}

const DAY_NAMES: Record<WeekdayKey, string> = {
    mon: 'segunda-feira',
    tue: 'terça-feira',
    wed: 'quarta-feira',
    thu: 'quinta-feira',
    fri: 'sexta-feira',
    sat: 'sábado',
    sun: 'domingo',
}

const isTravelGap = (value: number) => Number.isInteger(value) && value >= 15 && value <= 120 && value % 15 === 0

const emptyDay = (): DayWindow => ({
    enabled: false,
    start: null,
    end: null,
    break_start: null,
    break_end: null,
})

const emptyDays = (): Record<WeekdayKey, DayWindow> => ({
    mon: emptyDay(),
    tue: emptyDay(),
    wed: emptyDay(),
    thu: emptyDay(),
    fri: emptyDay(),
    sat: emptyDay(),
    sun: emptyDay(),
})

const asGap = (value: unknown): number | null => {
    if (value == null) return null
    const gap = Number(value)
    return isTravelGap(gap) ? gap : null
}

const presentDay = (row: {
    start_minute: number
    end_minute: number
    break_start_minute: number | null
    break_end_minute: number | null
}): DayWindow => ({
    enabled: true,
    start: minutesToClock(row.start_minute),
    end: minutesToClock(row.end_minute),
    break_start: row.break_start_minute == null ? null : minutesToClock(row.break_start_minute),
    break_end: row.break_end_minute == null ? null : minutesToClock(row.break_end_minute),
})

export const readWeeklyAvailability = async (providerId: string, client?: PoolClient): Promise<WeeklyAvailability> => {
    const provider = await execute<{ travel_gap_minutes: number | null, manual_fit: boolean }>(client, sql`
        SELECT ${providers.travel_gap_minutes} AS travel_gap_minutes, ${providers.manual_fit} AS manual_fit
        FROM ${providers} WHERE ${providers.id} = ${providerId}
    `)
    if (!provider.rows[0]) throw new AppError('Perfil do groomer não encontrado', 404)
    const days = emptyDays()
    const rows = await execute<{
        weekday: number
        start_minute: number
        end_minute: number
        break_start_minute: number | null
        break_end_minute: number | null
    }>(client, sql`
        SELECT weekday, start_minute, end_minute, break_start_minute, break_end_minute
        FROM ${providerWeekdays} WHERE ${providerWeekdays.provider_id} = ${providerId}
    `)
    for (const row of rows.rows) {
        const key = WEEKDAY_KEYS[row.weekday]
        if (key) days[key] = presentDay(row)
    }
    return {
        days,
        travel_gap_minutes: asGap(provider.rows[0].travel_gap_minutes),
        manual_fit: provider.rows[0].manual_fit === true,
    }
}

const normalizedDay = (day: SaveWeeklyAvailabilityInput['days'][WeekdayKey]): DayWindow => ({
    enabled: day.enabled,
    start: day.start?.trim() ? day.start.trim() : null,
    end: day.end?.trim() ? day.end.trim() : null,
    break_start: day.break_start?.trim() ? day.break_start.trim() : null,
    break_end: day.break_end?.trim() ? day.break_end.trim() : null,
})

export const writeWeeklyAvailability = async (
    providerId: string,
    input: SaveWeeklyAvailabilityInput,
): Promise<WeeklyAvailability> => {
    const days = emptyDays()
    for (const key of WEEKDAY_KEYS) {
        const day = normalizedDay(input.days[key])
        const issue = dayIssue(day, DAY_NAMES[key])
        if (issue) throw new AppError(issue, 400)
        days[key] = day.enabled
            ? day
            : emptyDay()
    }

    await withTransaction(async (client: PoolClient) => {
        const updated = await execute(client, sql`
            UPDATE ${providers}
            SET ${col(providers.travel_gap_minutes)} = ${input.travel_gap_minutes},
                ${col(providers.manual_fit)} = ${input.manual_fit}
            WHERE ${providers.id} = ${providerId}
        `)
        if (!updated.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
        await execute(client, sql`DELETE FROM ${providerWeekdays} WHERE ${providerWeekdays.provider_id} = ${providerId}`)
        for (const key of WEEKDAY_KEYS) {
            const day = days[key]
            if (!day.enabled) continue
            const start = clockToMinutes(day.start)
            const end = clockToMinutes(day.end)
            if (start == null || end == null) throw new AppError('Use o horário no formato HH:MM.', 400)
            await execute(client, sql`
                INSERT INTO ${providerWeekdays}(
                    provider_id, weekday, start_minute, end_minute, break_start_minute, break_end_minute
                ) VALUES (
                    ${providerId}, ${weekdayIndex(key)}, ${start}, ${end},
                    ${clockToMinutes(day.break_start)}, ${clockToMinutes(day.break_end)}
                )
            `)
        }
    })

    return readWeeklyAvailability(providerId)
}

export const readWeeklySlots = async (
    providerId: string,
    date: string,
    durationMinutes: number,
    client?: PoolClient,
): Promise<string[]> => {
    const key = weekdayOf(date)
    if (!key) throw new AppError('Informe a data.', 400)
    const routine = await readWeeklyAvailability(providerId, client)
    if (routine.travel_gap_minutes == null) {
        throw new AppError('Salve a rotina antes de gerar horários.', 409)
    }
    const day = routine.days[key]
    if (!day.enabled) return []
    const occupied = await readAgendaOccupancy(providerId, date, client)
    return generateStartMinutes({
        day,
        durationMinutes,
        travelGapMinutes: routine.travel_gap_minutes,
        occupied,
    }).map(minute => slotIso(date, minute))
}

export const createManualAppointment = async (
    providerId: string,
    input: ManualAppointmentInput,
): Promise<{ id: string, starts_at: string, ends_at: string }> => {
    const starts = new Date(input.starts_at)
    const ends = new Date(input.ends_at)
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
        throw new AppError('O fim precisa ser depois do início.', 400)
    }
    const startParts = saoPauloParts(starts)
    const endParts = saoPauloParts(ends)
    if (!startParts || !endParts || startParts.date !== endParts.date) {
        throw new AppError('O atendimento precisa começar e terminar no mesmo dia.', 400)
    }
    const key = weekdayOf(startParts.date)
    if (!key) throw new AppError('Informe a data.', 400)
    return withTransaction(async client => {
        await lockProviderAgenda(providerId, client)
        const routine = await readWeeklyAvailability(providerId, client)
        if (routine.travel_gap_minutes == null) {
            throw new AppError('Salve a rotina antes de incluir um atendimento.', 409)
        }
        if (routineCovers(routine.days[key], startParts.minutes, endParts.minutes)) {
            throw new AppError('Este horário está dentro da rotina. O encaixe manual é só para fora dela.', 400)
        }
        if (!routine.manual_fit) {
            throw new AppError('Encaixe manual desligado. Este horário está fora da rotina.', 409)
        }
        const origin = new Date(`${startParts.date}T00:00:00-03:00`).getTime()
        const startMinute = (starts.getTime() - origin) / 60000
        const endMinute = (ends.getTime() - origin) / 60000
        const occupied = await readAgendaOccupancy(providerId, startParts.date, client)
        if (occupied.some(block => intervalConflicts(startMinute, endMinute, block, routine.travel_gap_minutes!))) {
            throw new AppError('Este horário não está disponível. Escolha outro horário.', 409)
        }
        const id = randomUUID()
        await execute(client, sql`
            INSERT INTO ${providerManualAppointments}(id, provider_id, starts_at, ends_at)
            VALUES (${id}, ${providerId}, ${starts.toISOString()}, ${ends.toISOString()})
        `)
        return { id, starts_at: starts.toISOString(), ends_at: ends.toISOString() }
    })
}
