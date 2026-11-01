require('dotenv').config({ quiet: true })
const { test, before, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { Pool } = require('pg')
const { hash } = require('bcrypt')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const base = 'http://127.0.0.1:3000/api/v1'
const ids = Object.fromEntries(['tutor', 'professional', 'provider', 'offer', 'secondOffer', 'small', 'medium', 'foreignPet'].map(key => [key, randomUUID()]))
const emails = {
    tutor: `req-tutor-${ids.tutor}@mygroomer.test`,
    professional: `req-pro-${ids.professional}@mygroomer.test`,
}
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
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : {} }
}

const querySlots = (pet = ids.small, offer = ids.offer) => request(
    `/bookings/slots?provider_service_id=${offer}&pet_id=${pet}&date=${date}`, 'GET', undefined, tutorToken,
)

const book = (at, pet = ids.small, offer = ids.offer, extra = {}, token = tutorToken) => request('/bookings', 'POST', {
    pet_id: pet,
    provider_service_id: offer,
    scheduled_at: at,
    customer_location: 'Endereço fictício — teste 009',
    ...extra,
}, token)

const saveRoutine = async value => {
    const response = await request('/providers/weekly-availability', 'PUT', value, professionalToken)
    assert.equal(response.status, 200, JSON.stringify(response.body))
}

const clearBookings = async () => {
    await pool.query('DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE provider_service_id = ANY($1::uuid[]))', [[ids.offer, ids.secondOffer]])
    await pool.query('DELETE FROM bookings WHERE provider_service_id = ANY($1::uuid[])', [[ids.offer, ids.secondOffer]])
}

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    const passwordHash = await hash('admin', 10)
    for (const [key, role] of [['tutor', 'customer'], ['professional', 'provider']]) {
        await pool.query(`INSERT INTO users(id, name, email, password, role, email_verified_at)
            VALUES ($1,$2,$3,$4,$5,NOW())`, [ids[key], `Fixture 009 ${key}`, emails[key], passwordHash, role])
    }
    await pool.query(`INSERT INTO providers(id, user_id, travel_gap_minutes, manual_fit)
        VALUES ($1,$2,30,false)`, [ids.provider, ids.professional])
    for (const [offer, service] of [[ids.offer, seedId(5)], [ids.secondOffer, seedId(6)]]) {
        await pool.query(`INSERT INTO provider_services(id, provider_id, service_id, price, is_active, custom_name,
            price_small, price_medium, price_large, duration_small_minutes, duration_medium_minutes, duration_large_minutes)
            VALUES ($1,$2,$3,50,true,$4,50,80,100,30,60,90)`, [offer, ids.provider, service, offer === ids.offer ? 'Banho customizado' : null])
    }
    await pool.query(`INSERT INTO pets(id, owner_id, name, species, breed, size, age_years)
        VALUES ($1,$2,'Pet small','dog','SRD','small',2)`, [ids.small, ids.tutor])
    await pool.query(`INSERT INTO pets(id, owner_id, name, species, breed, size, age_years)
        VALUES ($1,$2,'Pet medium','dog','SRD','medium',3)`, [ids.medium, ids.tutor])
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
    await clearBookings()
    await pool.query('UPDATE provider_services SET is_active = true WHERE id = ANY($1::uuid[])', [[ids.offer, ids.secondOffer]])
    await saveRoutine(routine())
})

after(async () => {
    await clearBookings()
    await pool.query('DELETE FROM pets WHERE owner_id = ANY($1::uuid[])', [[ids.tutor, ids.professional]])
    await pool.query('DELETE FROM provider_services WHERE provider_id = $1', [ids.provider])
    await pool.query('DELETE FROM providers WHERE id = $1', [ids.provider])
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ids.tutor, ids.professional]])
    await pool.end()
})

test('valid slot creates pending_confirmation without payment fields', async () => {
    const slots = await querySlots()
    assert.equal(slots.status, 200)
    const slotPrice = slots.body.data.price
    const at = slots.body.data.slots[0]
    const created = await book(at)
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.message, 'Solicitação enviada')
    assert.equal(created.body.data.created, true)
    const booking = created.body.data.booking
    assert.equal(booking.booking_status, 'pending_confirmation')
    assert.equal(booking.customer_location, 'Endereço fictício — teste 009')
    assert.equal(booking.scheduled_at, at)
    assert.equal(Number(booking.price), slotPrice)
    assert.equal(Number(booking.service_price), slotPrice)
    assert.equal(typeof booking.price, 'number')
    assert.equal(booking.duration_minutes, 30)
    assert.equal(booking.service_name, 'Banho customizado')
    assert.equal(created.body.data.authorization_url, undefined)
    assert.equal(created.body.data.payment_mode, undefined)
    assert.equal((await pool.query('SELECT id FROM payments WHERE booking_id = $1', [booking.id])).rowCount, 0)
})

test('duplicate body returns 200 with same id; alternate offer same instant returns existing', async () => {
    const at = (await querySlots()).body.data.slots[0]
    const first = await book(at)
    assert.equal(first.status, 201)
    const second = await book(at)
    assert.equal(second.status, 200, JSON.stringify(second.body))
    assert.equal(second.body.data.created, false)
    assert.equal(second.body.message, 'Esta solicitação já foi enviada')
    assert.equal(second.body.data.booking.id, first.body.data.booking.id)
    assert.equal((await pool.query('SELECT id FROM bookings WHERE customer_id = $1', [ids.tutor])).rowCount, 1)
    const alternate = await book(at, ids.small, ids.secondOffer)
    assert.equal(alternate.status, 200)
    assert.equal(alternate.body.data.booking.id, first.body.data.booking.id)
})

test('cancelled booking allows a new request at the same instant', async () => {
    const at = (await querySlots()).body.data.slots[0]
    const first = await book(at)
    assert.equal((await request(`/bookings/${first.body.data.booking.id}/status`, 'PATCH', { booking_status: 'cancelled' })).status, 200)
    const second = await book(at)
    assert.equal(second.status, 201, JSON.stringify(second.body))
    assert.notEqual(second.body.data.booking.id, first.body.data.booking.id)
})

test('auth, role, validation and inactive offer failures leave no booking row', async () => {
    const at = iso('10:00')
    assert.equal((await book(at, ids.small, ids.offer, {}, null)).status, 401)
    assert.equal((await book(at, ids.small, ids.offer, {}, professionalToken)).status, 403)
    assert.equal((await book(at, ids.foreignPet)).status, 404)
    await pool.query('UPDATE provider_services SET is_active = false WHERE id = $1', [ids.offer])
    assert.equal((await book(at)).status, 404)
    await pool.query('UPDATE provider_services SET is_active = true WHERE id = $1', [ids.offer])
    assert.equal((await request('/bookings', 'POST', {
        provider_service_id: ids.offer,
        scheduled_at: at,
        customer_location: 'Local',
    })).status, 400)
    assert.equal((await book(at, ids.small, ids.offer, { customer_latitude: -23.5 })).status, 400)
    assert.equal((await pool.query('SELECT id FROM bookings WHERE customer_id = $1', [ids.tutor])).rowCount, 0)
})

test('unavailable slot and two pets same instant keep a single occupancy', async () => {
    const closed = routine()
    for (const key of dayKeys) closed.days[key] = { ...openDay, enabled: false }
    await saveRoutine(closed)
    assert.equal((await book(iso('09:00'))).status, 409)
    await saveRoutine(routine())
    const at = (await querySlots()).body.data.slots[0]
    const first = await book(at, ids.small)
    assert.equal(first.status, 201)
    const second = await book(at, ids.medium)
    assert.equal(second.status, 409)
    assert.equal((await pool.query('SELECT id FROM bookings WHERE customer_id = $1 AND booking_status <> $2', [ids.tutor, 'cancelled'])).rowCount, 1)
})
