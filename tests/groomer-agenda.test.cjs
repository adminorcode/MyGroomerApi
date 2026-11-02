const { test } = require('node:test')
const assert = require('node:assert/strict')
const window = require('../dist/modules/provider/agenda.window')
const schemas = require('../dist/modules/provider/agenda.schemas')

const from = '2026-11-01T00:00:00-03:00'
const to = '2026-11-02T00:00:00-03:00'
const parsed = () => window.parseAgendaWindow(from, to)

const appointment = (overrides) => ({
    id: 'booking-1',
    scheduled_at: '2026-11-01T14:30:00-03:00',
    duration_minutes: 60,
    booking_status: 'confirmed',
    customer_name: 'Ana Souza',
    customer_location: 'Rua das Flores, 123',
    service_name: 'Banho e tosa',
    pet_name: 'Mel',
    pet_photo_url: null,
    ...overrides,
})

test('a window accepts exactly 62 days and rejects a longer or inverted range', () => {
    const start = new Date('2026-11-01T00:00:00-03:00')
    const exact = new Date(start.getTime() + window.MAX_AGENDA_RANGE_MS)
    assert.equal(window.parseAgendaWindow(start.toISOString(), exact.toISOString()).to.getTime(), exact.getTime())
    assert.throws(
        () => window.parseAgendaWindow(start.toISOString(), new Date(exact.getTime() + 1).toISOString()),
        /62 dias/,
    )
    assert.throws(() => window.parseAgendaWindow(from, from), /depois do início/)
    assert.throws(() => window.parseAgendaWindow(to, from), /depois do início/)
})

test('the query schema keeps the same window rules and requires an offset', () => {
    assert.equal(schemas.agendaQuerySchema.safeParse({ from, to }).success, true)
    assert.equal(schemas.agendaQuerySchema.safeParse({ from: '2026-11-01T03:00:00.000Z', to }).success, true)
    assert.equal(schemas.agendaQuerySchema.safeParse({ from, to, extra: true }).success, false)
    assert.equal(schemas.agendaQuerySchema.safeParse({ from: '2026-11-01T00:00:00', to }).success, false)
    const inverted = schemas.agendaQuerySchema.safeParse({ from: to, to: from })
    assert.equal(inverted.success, false)
    assert.match(JSON.stringify(inverted.error.issues), /depois do início/)
    const start = new Date(from)
    const tooLong = schemas.agendaQuerySchema.safeParse({
        from: start.toISOString(),
        to: new Date(start.getTime() + window.MAX_AGENDA_RANGE_MS + 1).toISOString(),
    })
    assert.equal(tooLong.success, false)
    assert.match(JSON.stringify(tooLong.error.issues), /62 dias/)
})

test('today includes an appointment that starts in the day and excludes the next day and a cancelled one', () => {
    const agenda = window.buildAgenda(parsed(), {
        appointments: [
            appointment({ id: 'later', scheduled_at: '2026-11-01T17:00:00-03:00' }),
            appointment({ id: 'today', scheduled_at: '2026-11-01T09:00:00-03:00', pet_name: null, pet_photo_url: null }),
            appointment({ id: 'boundary', scheduled_at: from, booking_status: 'pending_confirmation' }),
            appointment({ id: 'traveling', scheduled_at: '2026-11-01T11:00:00-03:00', booking_status: 'en_route' }),
            appointment({ id: 'next-day', scheduled_at: to }),
            appointment({ id: 'cancelled', booking_status: 'cancelled' }),
        ],
        blocks: [],
        manualAppointments: [],
    })
    assert.deepEqual(agenda.appointments.map(item => item.id), ['boundary', 'today', 'traveling', 'later'])
    assert.equal(agenda.appointments.find(item => item.id === 'traveling').booking_status, 'en_route')
    assert.equal(agenda.timezone, 'America/Sao_Paulo')
    const withoutPet = agenda.appointments.find(item => item.id === 'today')
    assert.equal(withoutPet.pet_name, null)
    assert.equal(withoutPet.pet_photo_url, null)
    assert.equal(withoutPet.customer_name, 'Ana Souza')
    assert.equal(withoutPet.service_name, 'Banho e tosa')
    assert.equal(withoutPet.customer_location, 'Rua das Flores, 123')
    assert.equal(withoutPet.duration_minutes, 60)
    assert.equal(withoutPet.booking_status, 'confirmed')
})

test('a block that overlaps the window stays, and the appointment under it stays too', () => {
    const agenda = window.buildAgenda(parsed(), {
        appointments: [appointment({ id: 'kept' })],
        blocks: [
            { id: 'inside', starts_at: '2026-11-01T10:00:00-03:00', ends_at: '2026-11-01T11:00:00-03:00' },
            { id: 'crossing-start', starts_at: '2026-10-31T23:00:00-03:00', ends_at: '2026-11-01T00:30:00-03:00' },
            { id: 'ends-at-start', starts_at: '2026-10-31T22:00:00-03:00', ends_at: from },
            { id: 'starts-at-end', starts_at: to, ends_at: '2026-11-02T01:00:00-03:00' },
        ],
        manualAppointments: [
            { id: 'manual', starts_at: '2026-11-01T18:00:00-03:00', ends_at: '2026-11-01T19:00:00-03:00' },
            { id: 'manual-outside', starts_at: '2026-11-02T08:00:00-03:00', ends_at: '2026-11-02T09:00:00-03:00' },
        ],
    })
    assert.deepEqual(agenda.appointments.map(item => item.id), ['kept'])
    assert.deepEqual(agenda.blocks.map(item => item.id), ['crossing-start', 'inside'])
    assert.deepEqual(agenda.manual_appointments.map(item => item.id), ['manual'])
})
