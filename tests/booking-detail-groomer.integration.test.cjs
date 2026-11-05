require('dotenv').config({ quiet: true })
const { test, before, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { Pool } = require('pg')
const { hash } = require('bcrypt')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const base = 'http://127.0.0.1:3000/api/v1'
const keys = ['tutor', 'professional', 'other', 'provider', 'otherProvider', 'offer', 'pet']
const ids = Object.fromEntries(keys.map(key => [key, randomUUID()]))
const emails = {
    tutor: `detail-tutor-${ids.tutor}@mygroomer.test`,
    professional: `detail-pro-${ids.professional}@mygroomer.test`,
    other: `detail-other-${ids.other}@mygroomer.test`,
}
const seedId = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const timezone = 'America/Sao_Paulo'
const future = new Date(Date.now() + 12 * 86400000)
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(future).map(item => [item.type, item.value]))
const date = `${parts.year}-${parts.month}-${parts.day}`
const iso = clock => new Date(`${date}T${clock}:00-03:00`).toISOString()
const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const openDay = { enabled: true, start: '09:00', end: '18:00', break_start: '12:00', break_end: '13:00' }
const routine = () => ({ days: Object.fromEntries(dayKeys.map(day => [day, { ...openDay }])), travel_gap_minutes: 30, manual_fit: false })
const location = 'Rua das Flores, 10 — teste 017'
let tutorToken, professionalToken, otherToken
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

const book = at => request('/bookings', 'POST', {
    pet_id: ids.pet, provider_service_id: ids.offer, scheduled_at: at, customer_location: location,
})
const createdId = async at => {
    const response = await book(at)
    assert.equal(response.status, 201, JSON.stringify(response.body))
    return response.body.data.booking.id
}
const detail = (id, token = professionalToken) => request(`/bookings/${id}`, 'GET', undefined, token)
const changeStatus = (id, bookingStatus, token = professionalToken) => request(
    `/bookings/${id}/status`, 'PATCH', { booking_status: bookingStatus }, token,
)
const reschedule = (id, scheduled_at, token = professionalToken) => request(
    `/bookings/${id}/schedule`, 'PATCH', { scheduled_at }, token,
)
const openConvo = (id, token = professionalToken) => request(`/bookings/${id}/conversation`, 'POST', {}, token)
const slots = async (at, bookingId, token = professionalToken) => {
    const response = await request(
        `/bookings/slots?provider_service_id=${ids.offer}&pet_id=${ids.pet}&date=${date}&reschedule_booking_id=${bookingId}`,
        'GET',
        undefined,
        token,
    )
    assert.equal(response.status, 200, JSON.stringify(response.body))
    return response.body.data.slots
}
const saveRoutine = async () => {
    const response = await request('/providers/weekly-availability', 'PUT', routine(), professionalToken)
    assert.equal(response.status, 200, JSON.stringify(response.body))
}
const clearAgenda = () => pool.query('DELETE FROM bookings WHERE provider_service_id = $1', [ids.offer])

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    const passwordHash = await hash('admin', 10)
    for (const [key, role] of [['tutor', 'customer'], ['professional', 'provider'], ['other', 'provider']]) {
        await pool.query(
            `INSERT INTO users(id, name, email, password, role, email_verified_at, phone_number) VALUES ($1,$2,$3,$4,$5,NOW(),$6)`,
            [ids[key], `Fixture 017 ${key}`, emails[key], passwordHash, role, key === 'tutor' ? '+5511999999999' : null],
        )
    }
    await pool.query(
        `INSERT INTO providers(id, user_id, travel_gap_minutes, manual_fit) VALUES ($1,$2,30,false), ($3,$4,30,false)`,
        [ids.provider, ids.professional, ids.otherProvider, ids.other],
    )
    await pool.query(
        `INSERT INTO provider_services(id, provider_id, service_id, price, is_active,
            price_small, price_medium, price_large, duration_small_minutes, duration_medium_minutes, duration_large_minutes)
         VALUES ($1,$2,$3,50,true,50,80,100,30,60,90)`,
        [ids.offer, ids.provider, seedId(5)],
    )
    await pool.query(
        `INSERT INTO pets(id, owner_id, name, species, breed, size, age_years, notes) VALUES ($1,$2,'Luna','dog','Border Collie','small',3,'É dócil e gosta de carinho.')`,
        [ids.pet, ids.tutor],
    )
    const tutor = await request('/auth/login', 'POST', { email: emails.tutor, password: 'admin' }, null)
    const professional = await request('/auth/login', 'POST', { email: emails.professional, password: 'admin' }, null)
    const other = await request('/auth/login', 'POST', { email: emails.other, password: 'admin' }, null)
    assert.equal(tutor.status, 200)
    assert.equal(professional.status, 200)
    assert.equal(other.status, 200)
    tutorToken = tutor.body.token
    professionalToken = professional.body.token
    otherToken = other.body.token
    ready = true
})

beforeEach(async () => {
    if (!ready) return
    await pool.query('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE customer_id = $1 OR provider_id IN ($2, $3))', [ids.tutor, ids.professional, ids.other])
    await pool.query('DELETE FROM conversations WHERE customer_id = $1 OR provider_id IN ($2, $3)', [ids.tutor, ids.professional, ids.other])
    await clearAgenda()
    await saveRoutine()
})

after(async () => {
    await clearAgenda()
    await pool.query('DELETE FROM pets WHERE owner_id = $1', [ids.tutor])
    await pool.query('DELETE FROM provider_services WHERE provider_id = $1', [ids.provider])
    await pool.query('DELETE FROM providers WHERE id = ANY($1::uuid[])', [[ids.provider, ids.otherProvider]])
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ids.tutor, ids.professional, ids.other]])
    await pool.end()
})

test('AC-01 GET detail exposes pet, tutor, service and schedule fields', async () => {
    const id = await createdId(iso('09:00'))
    const response = await detail(id)
    assert.equal(response.status, 200)
    const data = response.body.data
    assert.equal(data.pet_name, 'Luna')
    assert.equal(data.pet_breed, 'Border Collie')
    assert.equal(data.pet_size, 'small')
    assert.equal(data.pet_age_years, 3)
    assert.match(data.pet_notes, /dócil/)
    assert.equal(data.customer_name, 'Fixture 017 tutor')
    assert.equal(data.customer_phone, '+5511999999999')
    assert.equal(data.customer_location, location)
    assert.equal(typeof data.service_name, 'string')
    assert.equal(data.duration_minutes, 30)
    assert.equal(data.price, 50)
    assert.equal(data.booking_status, 'pending_confirmation')
})

test('AC-02 accept and reject update status on GET', async () => {
    const acceptId = await createdId(iso('09:00'))
    assert.equal((await changeStatus(acceptId, 'confirmed')).status, 200)
    assert.equal((await detail(acceptId)).body.data.booking_status, 'confirmed')

    const rejectId = await createdId(iso('11:00'))
    assert.equal((await changeStatus(rejectId, 'cancelled')).status, 200)
    const rejected = (await detail(rejectId)).body.data
    assert.equal(rejected.booking_status, 'cancelled')
    assert.equal(typeof rejected.provider_rejected_at, 'string')
})

test('AC-03 reschedule keeps pet, tutor, offer, status, location and price', async () => {
    const id = await createdId(iso('09:00'))
    const blocked = await createdId(iso('11:00'))
    const conflict = await reschedule(blocked, iso('09:00'))
    assert.equal(conflict.status, 409)
    assert.equal((await detail(blocked)).body.data.scheduled_at, iso('11:00'))

    const before = (await detail(id)).body.data
    const options = await slots(iso('09:00'), id)
    const target = options.find(slot => slot !== iso('09:00') && slot !== iso('11:00'))
    assert.ok(target, 'expected another free slot')
    const updated = await reschedule(id, target)
    assert.equal(updated.status, 200)
    const after = updated.body.data
    assert.equal(after.scheduled_at, target)
    assert.equal(after.pet_id, before.pet_id)
    assert.equal(after.customer_id, before.customer_id)
    assert.equal(after.provider_service_id, before.provider_service_id)
    assert.equal(after.booking_status, before.booking_status)
    assert.equal(after.customer_location, before.customer_location)
    assert.equal(after.service_price, before.service_price)
    assert.equal(after.duration_minutes, 30)

    const same = await reschedule(id, target)
    assert.equal(same.status, 200)
})

test('AC-04 conversation creates once and reuses pair without duplicate', async () => {
    const id = await createdId(iso('09:00'))
    const first = await openConvo(id)
    assert.equal(first.status, 201)
    const convoId = first.body.data.id
    assert.ok(convoId)

    const second = await openConvo(id)
    assert.equal(second.status, 200)
    assert.equal(second.body.data.id, convoId)
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM conversations WHERE customer_id = $1 AND provider_id = $2', [ids.tutor, ids.professional])
    assert.equal(count.rows[0].n, 1)

    await pool.query('UPDATE conversations SET booking_id = NULL WHERE id = $1', [convoId])
    const third = await openConvo(id)
    assert.equal(third.status, 200)
    assert.equal(third.body.data.id, convoId)
    assert.equal((await pool.query('SELECT booking_id FROM conversations WHERE id = $1', [convoId])).rows[0].booking_id, null)
})

test('AC-05 another groomer is forbidden on detail, reschedule and conversation', async () => {
    const id = await createdId(iso('09:00'))
    const convoBefore = (await pool.query('SELECT COUNT(*)::int AS n FROM conversations')).rows[0].n
    assert.equal((await detail(id, otherToken)).status, 403)
    assert.equal((await reschedule(id, iso('11:00'), otherToken)).status, 403)
    assert.equal((await openConvo(id, otherToken)).status, 403)
    const convoAfter = (await pool.query('SELECT COUNT(*)::int AS n FROM conversations')).rows[0].n
    assert.equal(convoAfter, convoBefore)
})
