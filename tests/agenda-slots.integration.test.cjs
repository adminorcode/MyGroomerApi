require('dotenv').config({ quiet: true })
const { test, before, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { Pool } = require('pg')
const { hash } = require('bcrypt')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const base = 'http://127.0.0.1:3000/api/v1'
const ids = Object.fromEntries(['tutor', 'professional', 'provider', 'offer', 'secondOffer', 'small', 'medium', 'large', 'foreignPet'].map(key => [key, randomUUID()]))
const emails = { tutor: `slots-tutor-${ids.tutor}@mygroomer.test`, professional: `slots-pro-${ids.professional}@mygroomer.test` }
const seedId = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const timezone = 'America/Sao_Paulo'
const future = new Date(Date.now() + 10 * 86400000)
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(future).map(item => [item.type, item.value]))
const date = `${parts.year}-${parts.month}-${parts.day}`
const iso = clock => new Date(`${date}T${clock}:00-03:00`).toISOString()
const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const openDay = { enabled: true, start: '09:00', end: '18:00', break_start: '12:00', break_end: '13:00' }
const routine = () => ({ days: Object.fromEntries(dayKeys.map(day => [day, { ...openDay }])), travel_gap_minutes: 30, manual_fit: false })
let tutorToken, professionalToken
let ready = false

const request = async (route, method = 'GET', body, token = tutorToken) => {
    const response = await fetch(base + route, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : {} }
}
const querySlots = (pet = ids.small, offer = ids.offer, selectedDate = date, token = tutorToken) => request(
    `/bookings/slots?provider_service_id=${offer}&pet_id=${pet}&date=${selectedDate}`, 'GET', undefined, token,
)
const list = async (...args) => {
    const response = await querySlots(...args)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    return response.body.data
}
const book = (at, pet = ids.small, offer = ids.offer) => request('/bookings', 'POST', {
    pet_id: pet, provider_service_id: offer, scheduled_at: at, customer_location: 'Endereço fictício — teste 008',
})
const saveRoutine = async value => {
    const response = await request('/providers/weekly-availability', 'PUT', value, professionalToken)
    assert.equal(response.status, 200, JSON.stringify(response.body))
}
const block = async (start, end) => {
    const response = await request('/providers/agenda-blocks', 'POST', { starts_at: start, ends_at: end }, professionalToken)
    assert.equal(response.status, 201, JSON.stringify(response.body))
    return response.body.data
}
const clearAgenda = async () => {
    await pool.query('DELETE FROM bookings WHERE provider_service_id = ANY($1::uuid[])', [[ids.offer, ids.secondOffer]])
    await pool.query('DELETE FROM provider_agenda_blocks WHERE provider_id = $1', [ids.provider])
    await pool.query('DELETE FROM provider_manual_appointments WHERE provider_id = $1', [ids.provider])
}

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    const passwordHash = await hash('admin', 10)
    for (const [key, role] of [['tutor', 'customer'], ['professional', 'provider']]) {
        await pool.query(`INSERT INTO users(id, name, email, password, role, email_verified_at)
            VALUES ($1,$2,$3,$4,$5,NOW())`, [ids[key], `Fixture 008 ${key}`, emails[key], passwordHash, role])
    }
    await pool.query(`INSERT INTO providers(id, user_id, travel_gap_minutes, manual_fit)
        VALUES ($1,$2,30,false)`, [ids.provider, ids.professional])
    for (const [offer, service] of [[ids.offer, seedId(5)], [ids.secondOffer, seedId(6)]]) {
        await pool.query(`INSERT INTO provider_services(id, provider_id, service_id, price, is_active,
            price_small, price_medium, price_large, duration_small_minutes, duration_medium_minutes, duration_large_minutes)
            VALUES ($1,$2,$3,50,true,50,80,100,30,60,90)`, [offer, ids.provider, service])
    }
    for (const size of ['small', 'medium', 'large']) {
        await pool.query(`INSERT INTO pets(id, owner_id, name, species, breed, size, age_years)
            VALUES ($1,$2,$3,'dog','SRD',$4,2)`, [ids[size], ids.tutor, `Pet ${size}`, size])
    }
    await pool.query(`INSERT INTO pets(id, owner_id, name, species, breed, size, age_years)
        VALUES ($1,$2,'Pet alheio','cat','SRD','small',3)`, [ids.foreignPet, ids.professional])
    const tutor = await request('/auth/login', 'POST', { email: emails.tutor, password: 'admin' }, null)
    const professional = await request('/auth/login', 'POST', { email: emails.professional, password: 'admin' }, null)
    assert.equal(tutor.status, 200)
    assert.equal(professional.status, 200)
    tutorToken = tutor.body.token
    professionalToken = professional.body.token
    ready = true
})

beforeEach(async () => {
    if (!ready) return
    await clearAgenda()
    await pool.query(`UPDATE provider_services SET is_active = true, price_small = 50, price_medium = 80, price_large = 100,
        duration_small_minutes = 30, duration_medium_minutes = 60, duration_large_minutes = 90
        WHERE id = ANY($1::uuid[])`, [[ids.offer, ids.secondOffer]])
    await pool.query("UPDATE pets SET size = 'small' WHERE id = $1", [ids.small])
    await saveRoutine(routine())
})

after(async () => {
    await clearAgenda()
    await pool.query('DELETE FROM pets WHERE owner_id = ANY($1::uuid[])', [[ids.tutor, ids.professional]])
    await pool.query('DELETE FROM provider_services WHERE provider_id = $1', [ids.provider])
    await pool.query('DELETE FROM providers WHERE id = $1', [ids.provider])
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ids.tutor, ids.professional]])
    await pool.end()
})

test('slots require authentication, a real date, an owned pet and an active sized offer', async () => {
    assert.equal((await querySlots(ids.small, ids.offer, date, null)).status, 401)
    assert.equal((await querySlots(ids.small, ids.offer, '2026-02-30')).status, 400)
    assert.equal((await querySlots(ids.small, ids.offer, 'not-a-date')).status, 400)
    assert.equal((await querySlots(ids.foreignPet)).status, 404)
    await pool.query('UPDATE provider_services SET is_active = false WHERE id = $1', [ids.offer])
    assert.equal((await querySlots()).status, 404)
    assert.equal((await book(iso('09:00'))).status, 404)
    await pool.query('UPDATE provider_services SET is_active = true, duration_small_minutes = NULL WHERE id = $1', [ids.offer])
    assert.equal((await querySlots()).status, 409)
})

test('AC-02 derives all sizes, keeps break and day limits, excludes past and disabled days', async () => {
    const small = await list()
    const medium = await list(ids.medium)
    const large = await list(ids.large)
    assert.equal(small.duration_minutes, 30)
    assert.equal(small.price, 50)
    assert.equal(medium.duration_minutes, 60)
    assert.equal(medium.price, 80)
    assert.equal(large.duration_minutes, 90)
    assert.equal(large.price, 100)
    assert.equal(small.timezone, timezone)
    assert.deepEqual(small.slots.slice(0, 3), [iso('09:00'), iso('10:00'), iso('11:00')])
    for (const result of [small, medium, large]) {
        for (const instant of result.slots) {
            const start = new Date(instant).getTime()
            const end = start + result.duration_minutes * 60000
            assert.ok(end <= new Date(iso('12:00')).getTime() || start >= new Date(iso('13:00')).getTime())
            assert.ok(start >= new Date(iso('09:00')).getTime() && end <= new Date(iso('18:00')).getTime())
        }
    }
    assert.deepEqual((await list(ids.small, ids.offer, '2020-01-01')).slots, [])
    const closed = routine()
    for (const key of dayKeys) closed.days[key] = { ...openDay, enabled: false }
    await saveRoutine(closed)
    assert.deepEqual((await list()).slots, [])
    assert.equal((await book(iso('09:00'))).status, 409)
    await pool.query('UPDATE providers SET travel_gap_minutes = NULL WHERE id = $1', [ids.provider])
    assert.equal((await querySlots()).status, 409)
})

test('AC-01 block lifecycle is private and removes slots without artificial travel padding', async () => {
    assert.ok((await list()).slots.includes(iso('09:00')))
    const created = await block(iso('09:30'), iso('10:00'))
    const slots = (await list()).slots
    assert.ok(slots.includes(iso('09:00')), 'ends exactly at block start')
    assert.ok(slots.includes(iso('10:00')), 'starts exactly at block end')
    assert.equal((await request('/providers/agenda-blocks', 'GET')).status, 404)
    assert.equal((await request(`/providers/agenda-blocks/${created.id}`, 'DELETE')).status, 404)
    const own = await request('/providers/agenda-blocks', 'GET', undefined, professionalToken)
    assert.equal(own.status, 200)
    assert.ok(own.body.data.some(item => item.id === created.id))
    const full = await block(iso('09:00'), iso('11:00'))
    assert.ok(!(await list()).slots.includes(iso('09:00')))
    assert.equal((await book(iso('09:00'))).status, 409)
    assert.equal((await request(`/providers/agenda-blocks/${full.id}`, 'DELETE', undefined, professionalToken)).status, 204)
    assert.ok((await list()).slots.includes(iso('09:00')))
    assert.equal((await request('/providers/agenda-blocks', 'POST', { starts_at: iso('11:00'), ends_at: iso('10:00') }, professionalToken)).status, 400)
})

test('AC-02 appointments from every offer reserve travel time on both sides', async () => {
    const created = await book(iso('10:00'), ids.small, ids.secondOffer)
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const slots = (await list(ids.medium)).slots
    assert.ok(!slots.includes(iso('09:00')), '60 minute service would leave no travel time before 10:00 appointment')
    assert.ok(slots.includes(iso('11:00')), '30 minute service at 10:00 plus 30 minute travel')
    const atBoundary = await book(iso('11:00'), ids.medium)
    assert.equal(atBoundary.status, 201, JSON.stringify(atBoundary.body))
})

test('AC-04 revalidates block, routine, pet size and precise instant before inserting', async () => {
    const selected = (await list()).slots[0]
    const created = await block(selected, iso('10:00'))
    const refused = await book(selected)
    assert.equal(refused.status, 409)
    assert.match(refused.body.message, /horário.*disponível/)
    await request(`/providers/agenda-blocks/${created.id}`, 'DELETE', undefined, professionalToken)
    const shorter = routine()
    for (const key of dayKeys) shorter.days[key] = { ...openDay, start: '10:00' }
    await saveRoutine(shorter)
    assert.equal((await book(selected)).status, 409)
    await saveRoutine(routine())
    assert.equal((await book(new Date(new Date(selected).getTime() + 1000).toISOString())).status, 409)
    // 11:00 fits small, but not large before the 12:00 break.
    assert.ok((await list()).slots.includes(iso('11:00')))
    await pool.query("UPDATE pets SET size = 'large' WHERE id = $1", [ids.small])
    assert.equal((await book(iso('11:00'))).status, 409)
    assert.equal((await pool.query('SELECT id FROM bookings WHERE provider_service_id = $1', [ids.offer])).rowCount, 0)
})

test('AC-05 simultaneous requests across two offers create one occupancy', async () => {
    const results = await Promise.all([book(iso('09:00')), book(iso('09:00'), ids.small, ids.secondOffer)])
    assert.deepEqual(results.map(item => item.status).sort(), [200, 201])
    const stored = await pool.query('SELECT id, duration_minutes, service_price FROM bookings WHERE provider_service_id = ANY($1::uuid[])', [[ids.offer, ids.secondOffer]])
    assert.equal(stored.rowCount, 1)
    assert.equal(stored.rows[0].duration_minutes, 30)
    assert.equal(Number(stored.rows[0].service_price), 50)
    assert.equal((await request(`/bookings/${stored.rows[0].id}/status`, 'PATCH', { booking_status: 'cancelled' })).status, 200)
    assert.ok((await list()).slots.includes(iso('09:00')), 'cancellation frees occupancy')
})

test('AC-05 a stale confirmation cannot resurrect a cancelled booking after its slot is reused', async () => {
    const created = await book(iso('09:00'))
    assert.equal(created.status, 201)
    const bookingId = created.body.data.booking.id
    const blocker = await pool.connect()
    let committed = false
    try {
        await blocker.query('BEGIN')
        await blocker.query('SELECT id FROM bookings WHERE id = $1 FOR UPDATE', [bookingId])
        const confirming = request(`/bookings/${bookingId}/status`, 'PATCH', { booking_status: 'confirmed' }, professionalToken)
        // Observe the PATCH waiting at UPDATE: it has already read and authorized
        // the old pending_confirmation status, while this transaction owns the row.
        let waiting = false
        const deadline = Date.now() + 5000
        while (Date.now() < deadline && !waiting) {
            const activity = await pool.query(`SELECT a.pid FROM pg_stat_activity a
                WHERE a.wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(a.pid))
                  AND a.query LIKE '%UPDATE "bookings"%'`, [blocker.processID])
            waiting = activity.rowCount > 0
            if (!waiting) await new Promise(resolve => setTimeout(resolve, 25))
        }
        assert.equal(waiting, true, 'confirmation must be paused after reading the pending status')
        await blocker.query("UPDATE bookings SET booking_status = 'cancelled' WHERE id = $1", [bookingId])
        await blocker.query('COMMIT')
        committed = true
        const replacement = await book(iso('09:00'), ids.small, ids.secondOffer)
        assert.equal(replacement.status, 201, JSON.stringify(replacement.body))
        const stale = await confirming
        assert.equal(stale.status, 409, JSON.stringify(stale.body))
        const previous = await request(`/bookings/${bookingId}`)
        assert.equal(previous.body.data.booking_status, 'cancelled')
        const active = await pool.query(`SELECT id FROM bookings
            WHERE provider_service_id = ANY($1::uuid[]) AND booking_status <> 'cancelled'`, [[ids.offer, ids.secondOffer]])
        assert.equal(active.rowCount, 1)
        assert.equal(active.rows[0].id, replacement.body.data.booking.id)
    } finally {
        if (!committed) await blocker.query('ROLLBACK')
        blocker.release()
    }
})

test('booked duration and price survive menu and pet changes; legacy duration uses conservative fallback', async () => {
    const created = await book(iso('09:00'))
    assert.equal(created.status, 201)
    const bookingId = created.body.data.booking.id
    await pool.query('UPDATE provider_services SET duration_small_minutes = 90, price_small = 150, price = 150 WHERE id = $1', [ids.offer])
    await pool.query("UPDATE pets SET size = 'large' WHERE id = $1", [ids.small])
    const detail = await request(`/bookings/${bookingId}`)
    assert.equal(detail.body.data.duration_minutes, 30)
    assert.equal(Number(detail.body.data.price), 50)
    assert.ok((await list(ids.medium)).slots.includes(iso('10:00')), 'duration snapshot stays 30 plus travel gap')
    await pool.query('UPDATE bookings SET duration_minutes = NULL WHERE id = $1', [bookingId])
    assert.deepEqual((await list(ids.medium)).slots, [], 'unknown legacy duration reserves the conservative maximum 600 minutes')
})

test('cross-midnight blocks and manual appointments affect the tutor and cannot bypass conflicts', async () => {
    const expanded = routine()
    for (const key of dayKeys) expanded.days[key] = { enabled: true, start: '00:00', end: '12:00', break_start: null, break_end: null }
    expanded.manual_fit = true
    await saveRoutine(expanded)
    const midnight = new Date(`${date}T00:00:00-03:00`).getTime()
    const crossing = await block(new Date(midnight - 30 * 60000).toISOString(), new Date(midnight + 60 * 60000).toISOString())
    assert.ok(!(await list()).slots.includes(iso('00:00')))
    assert.ok((await list()).slots.includes(iso('01:00')))
    await request(`/providers/agenda-blocks/${crossing.id}`, 'DELETE', undefined, professionalToken)
    assert.ok((await list(ids.medium)).slots.includes(iso('10:30')))
    // Manual fit is for outside the routine and still obeys occupied intervals.
    const manual = await request('/providers/weekly-availability/appointments', 'POST', {
        starts_at: iso('11:45'), ends_at: iso('13:00'),
    }, professionalToken)
    assert.equal(manual.status, 201, JSON.stringify(manual.body))
    const incompatible = await request('/providers/weekly-availability/appointments', 'POST', {
        starts_at: iso('13:15'), ends_at: iso('14:00'),
    }, professionalToken)
    assert.equal(incompatible.status, 409)
    assert.ok(!(await list(ids.medium)).slots.includes(iso('10:30')), 'travel time before manual fit is reserved')
    assert.equal((await book(iso('14:00'))).status, 409, 'manual fit permission never expands tutor routine')
})
