require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { Pool } = require('pg')

const base = 'http://127.0.0.1:3000/api/v1'
const providerId = '10000000-0000-4000-8000-000000000003'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const password = 'admin'
let tutor
let groomer
let snapshot

const request = async (route, method = 'GET', body, token) => {
    const response = await fetch(base + route, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : {} }
}

const login = async email => {
    const result = await request('/auth/login', 'POST', { email, password })
    assert.equal(result.status, 200, email)
    return result.body.token
}

const day = (enabled, start = null, end = null, breakStart = null, breakEnd = null) => ({
    enabled,
    start,
    end,
    break_start: breakStart,
    break_end: breakEnd,
})

const routine = (overrides = {}) => ({
    days: {
        mon: day(true, '09:00', '13:00'),
        tue: day(false),
        wed: day(false),
        thu: day(false),
        fri: day(false),
        sat: day(false),
        sun: day(false),
    },
    travel_gap_minutes: 30,
    manual_fit: false,
    ...overrides,
})

const clocks = async (gap) => {
    const saved = await request('/providers/weekly-availability', 'PUT', routine({ travel_gap_minutes: gap }), groomer)
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    const slots = await request(
        '/providers/weekly-availability/slots?date=2026-11-02&duration_minutes=60',
        'GET',
        undefined,
        groomer,
    )
    assert.equal(slots.status, 200, JSON.stringify(slots.body))
    return slots.body.data.slots.map(iso => new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(iso)))
}

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true', 'Test requires the explicitly configured local environment')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    tutor = await login('tutor@email.com')
    groomer = await login('groomer@email.com')
    const current = await pool.query(
        'SELECT travel_gap_minutes, manual_fit FROM providers WHERE id = $1',
        [providerId],
    )
    snapshot = current.rows[0]
    assert.ok(snapshot, 'Conta de demonstração sem perfil profissional')
})

after(async () => {
    await pool.query('DELETE FROM provider_manual_appointments WHERE provider_id = $1', [providerId])
    await pool.query('DELETE FROM provider_weekdays WHERE provider_id = $1', [providerId])
    if (snapshot) {
        await pool.query(
            'UPDATE providers SET travel_gap_minutes = $2, manual_fit = $3 WHERE id = $1',
            [providerId, snapshot.travel_gap_minutes, snapshot.manual_fit],
        )
    }
    await pool.end()
})

test('tutor cannot read or save the weekly routine', async () => {
    assert.equal((await request('/providers/weekly-availability')).status, 401)
    assert.equal((await request('/providers/weekly-availability', 'GET', undefined, tutor)).status, 404)
    const denied = await request('/providers/weekly-availability', 'PUT', routine(), tutor)
    assert.equal(denied.status, 404)
})

test('invalid journey and break are refused', async () => {
    const backwards = routine()
    backwards.days.mon = day(true, '18:00', '09:00')
    const invalidDay = await request('/providers/weekly-availability', 'PUT', backwards, groomer)
    assert.equal(invalidDay.status, 400)
    assert.equal(invalidDay.body.message, 'O fim de segunda-feira precisa ser depois do início.')

    const outside = routine()
    outside.days.mon = day(true, '09:00', '12:00', '13:00', '14:00')
    const invalidBreak = await request('/providers/weekly-availability', 'PUT', outside, groomer)
    assert.equal(invalidBreak.status, 400)
    assert.equal(invalidBreak.body.message, 'O intervalo de segunda-feira precisa ficar dentro da jornada.')
})

test('disabled monday offers nothing and the saved gap separates slots', async () => {
    assert.deepEqual(await clocks(30), ['09:00', '10:30', '12:00'])
    assert.deepEqual(await clocks(15), ['09:00', '10:15', '11:30'])
    const closed = routine()
    closed.days.mon = day(false)
    const saved = await request('/providers/weekly-availability', 'PUT', closed, groomer)
    assert.equal(saved.status, 200)
    assert.equal(saved.body.data.days.mon.enabled, false)
    const slots = await request(
        '/providers/weekly-availability/slots?date=2026-11-02&duration_minutes=60',
        'GET',
        undefined,
        groomer,
    )
    assert.deepEqual(slots.body.data.slots, [])
    const tuesday = await request(
        '/providers/weekly-availability/slots?date=2026-11-03&duration_minutes=60',
        'GET',
        undefined,
        groomer,
    )
    assert.deepEqual(tuesday.body.data.slots, [])
})

test('manual fit refuses an appointment outside the routine until it is enabled', async () => {
    const saved = await request('/providers/weekly-availability', 'PUT', routine({ manual_fit: false }), groomer)
    assert.equal(saved.status, 200)
    const outside = {
        starts_at: '2026-11-02T14:00:00-03:00',
        ends_at: '2026-11-02T14:30:00-03:00',
    }
    const refused = await request('/providers/weekly-availability/appointments', 'POST', outside, groomer)
    assert.equal(refused.status, 409)
    assert.equal(refused.body.message, 'Encaixe manual desligado. Este horário está fora da rotina.')
    const enabled = await request('/providers/weekly-availability', 'PUT', routine({ manual_fit: true }), groomer)
    assert.equal(enabled.status, 200)
    const created = await request('/providers/weekly-availability/appointments', 'POST', outside, groomer)
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const again = await request('/providers/weekly-availability', 'PUT', routine({ manual_fit: false }), groomer)
    assert.equal(again.status, 200)
    const refusedAgain = await request('/providers/weekly-availability/appointments', 'POST', {
        starts_at: '2026-11-02T15:00:00-03:00',
        ends_at: '2026-11-02T15:30:00-03:00',
    }, groomer)
    assert.equal(refusedAgain.status, 409)
    const count = await pool.query(
        'SELECT count(*)::int AS total FROM provider_manual_appointments WHERE provider_id = $1',
        [providerId],
    )
    assert.equal(count.rows[0].total, 1)
})

test('travel gap accepts 15 minute steps up to 2 hours', async () => {
    const twoHours = await request('/providers/weekly-availability', 'PUT', routine({ travel_gap_minutes: 120 }), groomer)
    assert.equal(twoHours.status, 200, JSON.stringify(twoHours.body))
    assert.equal(twoHours.body.data.travel_gap_minutes, 120)
    const offStep = await request('/providers/weekly-availability', 'PUT', routine({ travel_gap_minutes: 20 }), groomer)
    assert.equal(offStep.status, 400)
    const tooLong = await request('/providers/weekly-availability', 'PUT', routine({ travel_gap_minutes: 135 }), groomer)
    assert.equal(tooLong.status, 400)
})
