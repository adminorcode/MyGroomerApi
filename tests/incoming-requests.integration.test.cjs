require('dotenv').config({ quiet: true })
const { test, before, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { Pool } = require('pg')
const { hash } = require('bcrypt')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const base = 'http://127.0.0.1:3000/api/v1'
const keys = ['tutor', 'professional', 'other', 'provider', 'otherProvider', 'offer', 'secondOffer', 'pet']
const ids = Object.fromEntries(keys.map(key => [key, randomUUID()]))
const emails = {
    tutor: `requests-tutor-${ids.tutor}@mygroomer.test`,
    professional: `requests-pro-${ids.professional}@mygroomer.test`,
    other: `requests-other-${ids.other}@mygroomer.test`,
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
const location = 'Rua das Flores, 10 — teste 016'
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

const inbox = async (query = '', token = professionalToken) => {
    const response = await request(`/providers/requests${query}`, 'GET', undefined, token)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    return response.body.data
}

const idsOf = data => data.requests.map(item => item.id)
const book = (at, offer = ids.offer) => request('/bookings', 'POST', {
    pet_id: ids.pet, provider_service_id: offer, scheduled_at: at, customer_location: location,
})
const createdId = async at => {
    const response = await book(at)
    assert.equal(response.status, 201, JSON.stringify(response.body))
    return response.body.data.booking.id
}
const changeStatus = (id, bookingStatus, token = professionalToken) => request(
    `/bookings/${id}/status`, 'PATCH', { booking_status: bookingStatus }, token,
)
const slots = async () => {
    const response = await request(`/bookings/slots?provider_service_id=${ids.offer}&pet_id=${ids.pet}&date=${date}`)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    return response.body.data.slots
}
const saveRoutine = async () => {
    const response = await request('/providers/weekly-availability', 'PUT', routine(), professionalToken)
    assert.equal(response.status, 200, JSON.stringify(response.body))
}
const clearAgenda = () => pool.query(
    'DELETE FROM bookings WHERE provider_service_id = ANY($1::uuid[])',
    [[ids.offer, ids.secondOffer]],
)

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    const passwordHash = await hash('admin', 10)
    for (const [key, role] of [['tutor', 'customer'], ['professional', 'provider'], ['other', 'provider']]) {
        await pool.query(
            `INSERT INTO users(id, name, email, password, role, email_verified_at) VALUES ($1,$2,$3,$4,$5,NOW())`,
            [ids[key], `Fixture 016 ${key}`, emails[key], passwordHash, role],
        )
    }
    await pool.query(
        `INSERT INTO providers(id, user_id, travel_gap_minutes, manual_fit) VALUES ($1,$2,30,false), ($3,$4,30,false)`,
        [ids.provider, ids.professional, ids.otherProvider, ids.other],
    )
    for (const [offer, service] of [[ids.offer, seedId(5)], [ids.secondOffer, seedId(6)]]) {
        await pool.query(
            `INSERT INTO provider_services(id, provider_id, service_id, price, is_active,
                price_small, price_medium, price_large, duration_small_minutes, duration_medium_minutes, duration_large_minutes)
             VALUES ($1,$2,$3,50,true,50,80,100,30,60,90)`,
            [offer, ids.provider, service],
        )
    }
    await pool.query(
        `INSERT INTO pets(id, owner_id, name, species, breed, size, age_years) VALUES ($1,$2,'Luna','dog','SRD','small',2)`,
        [ids.pet, ids.tutor],
    )
    const tutor = await request('/auth/login', 'POST', { email: emails.tutor, password: 'admin' }, null)
    const professional = await request('/auth/login', 'POST', { email: emails.professional, password: 'admin' }, null)
    const other = await request('/auth/login', 'POST', { email: emails.other, password: 'admin' }, null)
    assert.equal(tutor.status, 200, JSON.stringify(tutor.body))
    assert.equal(professional.status, 200, JSON.stringify(professional.body))
    assert.equal(other.status, 200, JSON.stringify(other.body))
    tutorToken = tutor.body.token
    professionalToken = professional.body.token
    otherToken = other.body.token
    ready = true
})

beforeEach(async () => {
    if (!ready) return
    await clearAgenda()
    await pool.query(`UPDATE provider_services SET is_active = true, custom_name = NULL, price = 50, price_small = 50
        WHERE id = ANY($1::uuid[])`, [[ids.offer, ids.secondOffer]])
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

test('tutor, anonymous and another groomer cannot read or reject the solicitation', async () => {
    assert.equal((await request('/providers/requests', 'GET', undefined, null)).status, 401)
    assert.equal((await request('/providers/requests', 'GET', undefined, null)).body.message, 'Invalid token')
    const tutorList = await request('/providers/requests', 'GET', undefined, tutorToken)
    assert.equal(tutorList.status, 404)
    assert.equal(tutorList.body.message, 'Perfil do groomer não encontrado')
    assert.equal((await request('/providers/requests?group=later', 'GET', undefined, professionalToken)).status, 400)
    assert.equal((await request('/providers/requests?page=0', 'GET', undefined, professionalToken)).body.success, false)
    const pendingId = await createdId(iso('09:00'))
    const foreign = await inbox('', otherToken)
    assert.equal(foreign.requests.some(item => item.id === pendingId), false)
    const rejected = await changeStatus(pendingId, 'cancelled', otherToken)
    assert.equal(rejected.status, 403)
    const row = await pool.query('SELECT booking_status, provider_rejected_at FROM bookings WHERE id = $1', [pendingId])
    assert.equal(row.rows[0].booking_status, 'pending_confirmation')
    assert.equal(row.rows[0].provider_rejected_at, null)
    const tutorConfirm = await changeStatus(pendingId, 'confirmed', tutorToken)
    assert.equal(tutorConfirm.status, 403)
})

test('AC-01 and AC-02 keep each group disjoint and expose the solicitation card fields', async () => {
    const pendingId = await createdId(iso('09:00'))
    const catalog = await pool.query(
        `SELECT services.name FROM provider_services
         JOIN services ON services.id = provider_services.service_id
         WHERE provider_services.id = $1`,
        [ids.offer],
    )
    const listed = (await inbox('?group=pending')).requests.find(item => item.id === pendingId)
    assert.equal(listed.group, 'pending')
    assert.equal(listed.booking_status, 'pending_confirmation')
    assert.equal(listed.pet_name, 'Luna')
    assert.equal(listed.customer_name, 'Fixture 016 tutor')
    assert.equal(listed.service_name, catalog.rows[0].name)
    assert.equal(listed.scheduled_at, iso('09:00'))
    assert.equal(listed.customer_location, location)
    assert.equal(listed.price, 50)
    assert.equal(typeof listed.price, 'number')

    await pool.query(`UPDATE provider_services SET custom_name = 'Tosa especial', price = 7, price_small = 7 WHERE id = $1`, [ids.offer])
    const renamed = (await inbox('?group=pending')).requests.find(item => item.id === pendingId)
    assert.equal(renamed.service_name, 'Tosa especial')
    assert.equal(renamed.price, 50)

    const acceptedId = await createdId(iso('11:00'))
    assert.equal((await changeStatus(acceptedId, 'confirmed')).status, 200)
    const rejectedId = await createdId(iso('14:00'))
    assert.equal((await changeStatus(rejectedId, 'cancelled')).status, 200)
    const outlierIds = []
    for (const [index, status] of ['in_progress', 'completed', 'pending_payment', 'cancelled'].entries()) {
        const outlierId = randomUUID()
        outlierIds.push(outlierId)
        await pool.query(
            `INSERT INTO bookings(id, customer_id, pet_id, provider_service_id, scheduled_at, customer_location, booking_status, duration_minutes, service_price)
             VALUES ($1,$2,$3,$4, NOW() + make_interval(days => $5), 'fora da caixa', $6, 30, 40)`,
            [outlierId, ids.tutor, ids.pet, ids.offer, 40 + index, status],
        )
    }

    const pending = await inbox('?group=pending')
    const accepted = await inbox('?group=accepted')
    const rejected = await inbox('?group=rejected')
    const all = await inbox('?group=all')
    assert.deepEqual(idsOf(pending), [pendingId])
    assert.deepEqual(idsOf(accepted), [acceptedId])
    assert.deepEqual(idsOf(rejected), [rejectedId])
    assert.deepEqual(idsOf(all), [pendingId, acceptedId, rejectedId])
    assert.equal(outlierIds.some(id => idsOf(all).includes(id)), false)
})

test('AC-03 accepting moves the solicitation to Aceitas and keeps the hour occupied without payment', async () => {
    assert.ok((await slots()).includes(iso('09:00')))
    const id = await createdId(iso('09:00'))
    assert.equal((await slots()).includes(iso('09:00')), false)
    assert.deepEqual(idsOf(await inbox('?group=pending')), [id])
    const accepted = await changeStatus(id, 'confirmed')
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.data.provider_rejected_at, null)
    assert.deepEqual(idsOf(await inbox('?group=pending')), [])
    assert.deepEqual(idsOf(await inbox('?group=accepted')), [id])
    assert.equal((await slots()).includes(iso('09:00')), false)
    assert.equal((await pool.query('SELECT id FROM payments WHERE booking_id = $1', [id])).rowCount, 0)
})

test('AC-04 a groomer refusal is stamped and frees the hour; tutor and confirmed cancellations are not refusals', async () => {
    const refusedId = await createdId(iso('09:00'))
    const refused = await changeStatus(refusedId, 'cancelled')
    assert.equal(refused.status, 200)
    assert.equal(typeof refused.body.data.provider_rejected_at, 'string')
    assert.deepEqual(idsOf(await inbox('?group=pending')), [])
    assert.deepEqual(idsOf(await inbox('?group=rejected')), [refusedId])
    assert.ok((await slots()).includes(iso('09:00')))

    const tutorCancelledId = await createdId(iso('11:00'))
    const tutorCancelled = await changeStatus(tutorCancelledId, 'cancelled', tutorToken)
    assert.equal(tutorCancelled.status, 200)
    assert.equal(tutorCancelled.body.data.provider_rejected_at, null)
    assert.equal(idsOf(await inbox('?group=rejected')).includes(tutorCancelledId), false)
    assert.ok((await slots()).includes(iso('11:00')))

    const confirmedId = await createdId(iso('14:00'))
    assert.equal((await changeStatus(confirmedId, 'confirmed')).status, 200)
    const confirmedCancel = await changeStatus(confirmedId, 'cancelled')
    assert.equal(confirmedCancel.status, 200)
    assert.equal(confirmedCancel.body.data.provider_rejected_at, null)
    assert.equal(idsOf(await inbox('?group=rejected')).includes(confirmedId), false)
    assert.equal(idsOf(await inbox()).includes(confirmedId), false)
    assert.ok((await slots()).includes(iso('14:00')))
})

test('AC-05 pending_today_count follows the Sao Paulo day and ignores the selected group and page', async () => {
    const todayEarly = await createdId(iso('09:00'))
    const todayLate = await createdId(iso('11:00'))
    const yesterday = await createdId(iso('15:00'))
    await pool.query(
        `UPDATE bookings
         SET created_at = (((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 1) + time '12:00') AT TIME ZONE 'America/Sao_Paulo'
         WHERE id = $1`,
        [yesterday],
    )

    const firstPage = await inbox('?group=pending&page=1&limit=1')
    const secondPage = await inbox('?group=accepted&page=2&limit=1')
    const all = await inbox()
    assert.equal(firstPage.pending_today_count, 2)
    assert.equal(secondPage.pending_today_count, 2)
    assert.equal(all.pending_today_count, 2)
    assert.equal(all.group, 'all')
    assert.equal(all.page, 1)
    assert.equal(all.limit, 50)
    assert.deepEqual(idsOf(firstPage), [todayEarly])
    assert.deepEqual(idsOf(await inbox('?group=pending')), [todayEarly, todayLate, yesterday])

    assert.equal((await changeStatus(todayEarly, 'confirmed')).status, 200)
    assert.equal((await inbox('?group=rejected')).pending_today_count, 1)
    assert.equal((await changeStatus(todayLate, 'cancelled')).status, 200)
    const after = await inbox('?group=pending&page=9&limit=1')
    assert.equal(after.pending_today_count, 0)
    assert.deepEqual(idsOf(await inbox('?group=pending')), [yesterday])
    assert.deepEqual(idsOf(await inbox('?group=accepted')), [todayEarly])
    assert.deepEqual(idsOf(await inbox('?group=rejected')), [todayLate])
})
