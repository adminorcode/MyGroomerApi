require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { Pool } = require('pg')

const base = 'http://127.0.0.1:3000/api/v1'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const password = 'admin'
const paulista = { latitude: -23.561414, longitude: -46.655881, address: 'Avenida Paulista, São Paulo' }
let tutor
let groomer
let other
let tutorId
let otherId

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

const addressBody = (overrides = {}) => ({
    label: 'home',
    address: paulista.address,
    latitude: paulista.latitude,
    longitude: paulista.longitude,
    ...overrides,
})

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true', 'Test requires the explicitly configured local environment')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    const tutorRow = await pool.query("SELECT id, address FROM users WHERE email = 'tutor@email.com'")
    tutorId = tutorRow.rows[0].id
    assert.equal(tutorRow.rows[0].address, 'Endereco ficticio - teste local')
    otherId = crypto.randomUUID()
    await pool.query(
        `INSERT INTO users (id, name, email, password, role, email_verified_at)
         SELECT $1, 'Outro Tutor', $2, password, 'customer', NOW()
         FROM users WHERE email = 'tutor@email.com'`,
        [otherId, `outro-${otherId}@mygroomer.test`],
    )
    tutor = await login('tutor@email.com')
    groomer = await login('groomer@email.com')
    other = await login(`outro-${otherId}@mygroomer.test`)
    await pool.query('DELETE FROM customer_addresses WHERE customer_id = ANY($1::uuid[])', [[tutorId, otherId]])
})

after(async () => {
    await pool.query('DELETE FROM customer_addresses WHERE customer_id = ANY($1::uuid[])', [[tutorId, otherId].filter(Boolean)])
    if (otherId) await pool.query('DELETE FROM users WHERE id = $1', [otherId])
    await pool.end()
})

test('tutor without saved addresses receives an empty list and keeps users.address', async () => {
    const list = await request('/customer-addresses', 'GET', undefined, tutor)
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.data, [])
    const row = await pool.query('SELECT address FROM users WHERE id = $1', [tutorId])
    assert.equal(row.rows[0].address, 'Endereco ficticio - teste local')
})

test('creating an address stores the point and rejects a place outside Brazil', async () => {
    const tiles = await request('/providers/service-location/map-tiles', 'GET', undefined, tutor)
    assert.equal(tiles.status, 200)
    const suggestions = await request(
        `/providers/service-location/autocomplete?text=${encodeURIComponent(paulista.address)}`,
        'GET',
        undefined,
        tutor,
    )
    assert.equal(suggestions.status, 200)
    assert.ok(suggestions.body.data.some(item => Number.isFinite(item.latitude)))
    const created = await request('/customer-addresses', 'POST', addressBody(), tutor)
    assert.equal(created.status, 201)
    assert.equal(created.body.data.label, 'home')
    assert.equal(created.body.data.address, paulista.address)
    assert.equal(created.body.data.latitude, paulista.latitude)
    assert.equal(created.body.data.longitude, paulista.longitude)
    assert.equal(created.body.data.is_default, true)
    assert.equal(created.body.data.complement, null)
    const columns = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'customer_addresses' AND column_name = 'postal_code'`,
    )
    assert.equal(columns.rowCount, 0)
    const outside = await request('/customer-addresses', 'POST', addressBody({ latitude: 40.7, longitude: -74 }), tutor)
    assert.equal(outside.status, 400)
    assert.equal(outside.body.message, 'O endereço precisa estar no Brasil.')
    const missing = await request('/customer-addresses', 'POST', { label: 'work', address: paulista.address }, tutor)
    assert.equal(missing.status, 400)
    const count = await pool.query('SELECT COUNT(*)::int AS total FROM customer_addresses WHERE customer_id = $1', [tutorId])
    assert.equal(count.rows[0].total, 1)
    await pool.query('DELETE FROM customer_addresses WHERE customer_id = $1', [tutorId])
})

test('addresses can be edited, promoted and removed with a replacement default', async () => {
    const first = await request('/customer-addresses', 'POST', addressBody({ is_default: false }), tutor)
    assert.equal(first.body.data.is_default, true)
    const second = await request('/customer-addresses', 'POST', addressBody({
        label: 'work',
        address: 'Rua Augusta, São Paulo',
        latitude: -23.555,
        longitude: -46.66,
        is_default: false,
    }), tutor)
    assert.equal(second.body.data.is_default, false)
    const incomplete = await request(`/customer-addresses/${second.body.data.id}`, 'PATCH', {
        address: 'Rua sem ponto',
    }, tutor)
    assert.equal(incomplete.status, 400)
    assert.equal(incomplete.body.message, 'Ao trocar o endereço, informe o texto, a latitude e a longitude.')
    const edited = await request(`/customer-addresses/${second.body.data.id}`, 'PATCH', {
        address: 'Rua da Consolação, São Paulo',
        latitude: -23.55,
        longitude: -46.66,
    }, tutor)
    assert.equal(edited.status, 200)
    assert.equal(edited.body.data.address, 'Rua da Consolação, São Paulo')
    assert.equal(edited.body.data.latitude, -23.55)
    const promoted = await request(`/customer-addresses/${second.body.data.id}`, 'PATCH', { is_default: true }, tutor)
    assert.equal(promoted.body.data.is_default, true)
    const list = await request('/customer-addresses', 'GET', undefined, tutor)
    const previous = list.body.data.find(item => item.id === first.body.data.id)
    assert.equal(previous.is_default, false)
    const blocked = await request(`/customer-addresses/${second.body.data.id}`, 'DELETE', undefined, tutor)
    assert.equal(blocked.status, 400)
    assert.equal(blocked.body.message, 'Escolha outro endereço padrão.')
    const removed = await request(
        `/customer-addresses/${second.body.data.id}?replacement_id=${first.body.data.id}`,
        'DELETE',
        undefined,
        tutor,
    )
    assert.equal(removed.status, 204)
    const after = await request('/customer-addresses', 'GET', undefined, tutor)
    assert.equal(after.body.data.length, 1)
    assert.equal(after.body.data[0].id, first.body.data.id)
    assert.equal(after.body.data[0].is_default, true)
    const last = await request(`/customer-addresses/${first.body.data.id}`, 'DELETE', undefined, tutor)
    assert.equal(last.status, 204)
    const empty = await request('/customer-addresses', 'GET', undefined, tutor)
    assert.deepEqual(empty.body.data, [])
})

test('the default point is accepted by the existing coverage search', async () => {
    const created = await request('/customer-addresses', 'POST', addressBody(), tutor)
    assert.equal(created.body.data.is_default, true)
    const coverage = await request(
        `/providers/coverage?address=${encodeURIComponent(created.body.data.address)}&latitude=${created.body.data.latitude}&longitude=${created.body.data.longitude}&service_id=${id(5)}`,
        'GET',
        undefined,
        tutor,
    )
    assert.equal(coverage.status, 200)
    assert.equal(coverage.body.data.latitude, created.body.data.latitude)
    assert.equal(coverage.body.data.longitude, created.body.data.longitude)
    assert.ok(coverage.body.data.providers.some(item => item.provider_id === id(3)))
    await pool.query('DELETE FROM customer_addresses WHERE customer_id = $1', [tutorId])
})

test('another tutor cannot read a foreign address and a groomer cannot create one', async () => {
    const created = await request('/customer-addresses', 'POST', addressBody({ label: 'other' }), tutor)
    const hidden = await request('/customer-addresses', 'GET', undefined, other)
    assert.equal(hidden.status, 200)
    assert.deepEqual(hidden.body.data, [])
    const missing = await request(`/customer-addresses/${created.body.data.id}`, 'PATCH', { label: 'work' }, other)
    assert.equal(missing.status, 404)
    assert.equal(missing.body.message, 'Endereço não encontrado')
    const denied = await request('/customer-addresses', 'POST', addressBody(), groomer)
    assert.equal(denied.status, 403)
    assert.equal(denied.body.message, 'Só o tutor cadastra endereços de atendimento.')
    const postal = await request('/providers/service-location', 'GET', undefined, tutor)
    assert.equal(postal.status, 404)
    await pool.query('DELETE FROM customer_addresses WHERE customer_id = $1', [tutorId])
})

test('reverse geocode turns the current point into an address inside Brazil', async () => {
    const found = await request(
        `/providers/service-location/reverse?latitude=${paulista.latitude}&longitude=${paulista.longitude}`,
        'GET',
        undefined,
        tutor,
    )
    assert.equal(found.status, 200)
    assert.equal(found.body.data.address.length >= 3, true)
    assert.equal(Number.isFinite(found.body.data.latitude), true)
    const outside = await request('/providers/service-location/reverse?latitude=40.7&longitude=-74', 'GET', undefined, tutor)
    assert.equal(outside.status, 400)
    assert.equal(outside.body.message, 'O endereço precisa estar no Brasil.')
    const anonymous = await request(`/providers/service-location/reverse?latitude=${paulista.latitude}&longitude=${paulista.longitude}`)
    assert.equal(anonymous.status, 401)
})
