export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

export type DayWindow = {
    enabled: boolean
    start: string | null
    end: string | null
    break_start: string | null
    break_end: string | null
}

const WEEKDAY_FROM_SHORT: Record<string, WeekdayKey> = {
    Mon: 'mon',
    Tue: 'tue',
    Wed: 'wed',
    Thu: 'thu',
    Fri: 'fri',
    Sat: 'sat',
    Sun: 'sun',
}

export const weekdayIndex = (key: WeekdayKey): number => WEEKDAY_KEYS.indexOf(key)

export const clockToMinutes = (value: string | null | undefined): number | null => {
    if (!value || !value.trim()) return null
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
    if (!match) return null
    return Number(match[1]) * 60 + Number(match[2])
}

export const minutesToClock = (minutes: number): string => {
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const weekdayOf = (date: string): WeekdayKey | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    const probe = new Date(`${date}T12:00:00-03:00`)
    if (Number.isNaN(probe.getTime())) return null
    const shortName = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
    }).format(probe)
    return WEEKDAY_FROM_SHORT[shortName] ?? null
}

export const saoPauloParts = (instant: Date): { date: string, minutes: number } | null => {
    if (Number.isNaN(instant.getTime())) return null
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(instant).map(part => [part.type, part.value]))
    const hour = Number(parts.hour)
    const minute = Number(parts.minute)
    if (!parts.year || !parts.month || !parts.day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: hour * 60 + minute,
    }
}

export type WorkWindow = [number, number]

export const workWindows = (day: DayWindow): WorkWindow[] | 'invalid' => {
    if (!day.enabled) return []
    const start = clockToMinutes(day.start)
    const end = clockToMinutes(day.end)
    if (start == null || end == null || end <= start) return 'invalid'
    const hasBreakStart = !!day.break_start?.trim()
    const hasBreakEnd = !!day.break_end?.trim()
    if (hasBreakStart !== hasBreakEnd) return 'invalid'
    if (!hasBreakStart) return [[start, end]]
    const breakStart = clockToMinutes(day.break_start)
    const breakEnd = clockToMinutes(day.break_end)
    if (breakStart == null || breakEnd == null || breakEnd <= breakStart) return 'invalid'
    if (breakStart < start || breakEnd > end) return 'invalid'
    const windows: WorkWindow[] = []
    if (breakStart > start) windows.push([start, breakStart])
    if (end > breakEnd) windows.push([breakEnd, end])
    return windows
}

export const dayIssue = (day: DayWindow, name: string): string | null => {
    if (!day.enabled) return null
    const start = clockToMinutes(day.start)
    const end = clockToMinutes(day.end)
    if (start == null || end == null) return `Use o horário de ${name} no formato HH:MM.`
    if (end <= start) return `O fim de ${name} precisa ser depois do início.`
    const hasBreakStart = !!day.break_start?.trim()
    const hasBreakEnd = !!day.break_end?.trim()
    if (hasBreakStart !== hasBreakEnd) return `Informe o início e o fim do intervalo de ${name}.`
    if (!hasBreakStart) return null
    const breakStart = clockToMinutes(day.break_start)
    const breakEnd = clockToMinutes(day.break_end)
    if (breakStart == null || breakEnd == null) return `Use o intervalo de ${name} no formato HH:MM.`
    if (breakEnd <= breakStart || breakStart < start || breakEnd > end) {
        return `O intervalo de ${name} precisa ficar dentro da jornada.`
    }
    return null
}

export const routineCovers = (day: DayWindow, startMinute: number, endMinute: number): boolean => {
    if (endMinute <= startMinute) return false
    const windows = workWindows(day)
    if (windows === 'invalid') return false
    return windows.some(([open, close]) => startMinute >= open && endMinute <= close)
}

export type OccupiedInterval = { start: number, end: number }

export const generateStartMinutes = (input: {
    day: DayWindow
    durationMinutes: number
    travelGapMinutes: number
    occupied?: OccupiedInterval[]
}): number[] => {
    const windows = workWindows(input.day)
    if (windows === 'invalid' || input.durationMinutes <= 0 || input.travelGapMinutes < 0) return []
    const occupied = [...(input.occupied ?? [])].sort((left, right) => left.start - right.start)
    const slots: number[] = []
    for (const [open, close] of windows) {
        let cursor = open
        while (cursor + input.durationMinutes <= close) {
            const slotEnd = cursor + input.durationMinutes
            const hit = occupied.find(block => block.start < slotEnd && block.end > cursor)
            if (hit) {
                cursor = Math.max(cursor + 1, hit.end + input.travelGapMinutes)
                continue
            }
            slots.push(cursor)
            cursor = slotEnd + input.travelGapMinutes
        }
    }
    return slots
}

export const slotIso = (date: string, minute: number): string =>
    new Date(`${date}T${minutesToClock(minute)}:00-03:00`).toISOString()
