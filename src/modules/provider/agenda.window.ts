import { AppError } from '../../shared/errors'

export const AGENDA_TIMEZONE = 'America/Sao_Paulo'
export const MAX_AGENDA_RANGE_MS = 62 * 24 * 60 * 60 * 1000

export type AgendaWindow = { from: Date, to: Date }

export const parseAgendaWindow = (from: string, to: string): AgendaWindow => {
    const start = new Date(from)
    const end = new Date(to)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) {
        throw new AppError('O fim da agenda precisa ser depois do início.', 400)
    }
    if (end.getTime() - start.getTime() > MAX_AGENDA_RANGE_MS) {
        throw new AppError('A agenda só pode ser consultada em até 62 dias.', 400)
    }
    return { from: start, to: end }
}

/** Half-open [from, to). An appointment belongs to the window by its start. */
export const instantInAgendaWindow = (instant: Date, window: AgendaWindow): boolean => {
    const time = instant.getTime()
    return time >= window.from.getTime() && time < window.to.getTime()
}

/** A block or manual appointment belongs when it overlaps [from, to). */
export const intervalOverlapsAgendaWindow = (starts: Date, ends: Date, window: AgendaWindow): boolean => {
    return starts.getTime() < window.to.getTime() && ends.getTime() > window.from.getTime()
}

export type AgendaAppointmentSource = {
    id: string
    scheduled_at: Date | string
    duration_minutes: number | string | null
    booking_status: string
    customer_name: string | null
    customer_location: string | null
    service_name: string | null
    pet_name: string | null
    pet_photo_url: string | null
}

export type AgendaAppointment = {
    id: string
    scheduled_at: string
    duration_minutes: number | null
    booking_status: string
    customer_name: string | null
    customer_location: string | null
    service_name: string | null
    pet_name: string | null
    pet_photo_url: string | null
}

export type AgendaIntervalSource = { id: string, starts_at: Date | string, ends_at: Date | string }
export type AgendaInterval = { id: string, starts_at: string, ends_at: string }

const asDate = (value: Date | string) => value instanceof Date ? value : new Date(value)

const durationMinutes = (value: number | string | null) => {
    if (value == null) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

export const toAgendaAppointment = (
    row: AgendaAppointmentSource,
    window: AgendaWindow,
): AgendaAppointment | null => {
    if (row.booking_status === 'cancelled') return null
    const scheduled = asDate(row.scheduled_at)
    if (!instantInAgendaWindow(scheduled, window)) return null
    return {
        id: row.id,
        scheduled_at: scheduled.toISOString(),
        duration_minutes: durationMinutes(row.duration_minutes),
        booking_status: row.booking_status,
        customer_name: row.customer_name,
        customer_location: row.customer_location,
        service_name: row.service_name,
        pet_name: row.pet_name,
        pet_photo_url: row.pet_photo_url,
    }
}

export const toAgendaInterval = (row: AgendaIntervalSource, window: AgendaWindow): AgendaInterval | null => {
    const starts = asDate(row.starts_at)
    const ends = asDate(row.ends_at)
    if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime())) return null
    if (!intervalOverlapsAgendaWindow(starts, ends, window)) return null
    return { id: row.id, starts_at: starts.toISOString(), ends_at: ends.toISOString() }
}

export const buildAgenda = (
    window: AgendaWindow,
    source: {
        appointments: AgendaAppointmentSource[]
        blocks: AgendaIntervalSource[]
        manualAppointments: AgendaIntervalSource[]
    },
) => {
    const appointments = source.appointments
        .map(row => toAgendaAppointment(row, window))
        .filter((row): row is AgendaAppointment => row !== null)
        .sort((left, right) => left.scheduled_at.localeCompare(right.scheduled_at))
    const blocks = source.blocks
        .map(row => toAgendaInterval(row, window))
        .filter((row): row is AgendaInterval => row !== null)
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
    const manual_appointments = source.manualAppointments
        .map(row => toAgendaInterval(row, window))
        .filter((row): row is AgendaInterval => row !== null)
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
    return { timezone: AGENDA_TIMEZONE, appointments, blocks, manual_appointments }
}
