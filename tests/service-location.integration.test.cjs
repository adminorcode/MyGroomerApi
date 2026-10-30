require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { Pool } = require('pg')

const base = 'http://127.0.0.1:3000/api/v1'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const password = 'admin'
const providerId = id(3)
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

const locationRow = () => pool.query(
    `SELECT base_address, base_postal_code, base_complement, base_latitude, base_longitude,
            radius_km, travel_fee_mode, travel_fee_per_km
     FROM providers WHERE id = $1`,
    [providerId],
)

const save = body => request('/providers/service-location', 'PUT', body, groomer)

const paulista = (overrides = {}) => ({
    address: 'Avenida Paulista, São Paulo',
    postal_code: '01310-100',
    complement: null,
    radius_km: 8,
    travel_fee_mode: 'included',
    travel_fee_per_km: null,
    ...overrides,
})

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true', 'Test requires the explicitly configured local environment')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    tutor = await login('tutor@email.com')
    groomer = await login('groomer@email.com')
    const current = await locationRow()
    snapshot = current.rows[0]
    assert.ok(snapshot, 'Conta de demonstração sem perfil profissional')
})

after(async () => {
    if (snapshot) {
        await pool.query(
            `UPDATE providers SET
                base_address = $2,
                base_postal_code = $3,
                base_complement = $4,
                base_latitude = $5,
                base_longitude = $6,
                radius_km = $7,
                travel_fee_mode = $8,
                travel_fee_per_km = $9
             WHERE id = $1`,
            [
                providerId,
                snapshot.base_address,
                snapshot.base_postal_code,
                snapshot.base_complement,
                snapshot.base_latitude,
                snapshot.base_longitude,
                snapshot.radius_km,
                snapshot.travel_fee_mode,
                snapshot.travel_fee_per_km,
            ],
        )
    }
    await pool.end()
})

test('tutor and anonymous callers cannot read or save the service location', async () => {
    assert.equal((await request('/providers/service-location')).status, 401)
    assert.equal((await request('/providers/service-location', 'GET', undefined, tutor)).status, 404)
    const denied = await request('/providers/service-location', 'PUT', paulista(), tutor)
    assert.equal(denied.status, 404)
    const row = await locationRow()
    assert.equal(row.rows[0].base_address, snapshot.base_address)
    assert.equal(String(row.rows[0].radius_km), String(snapshot.radius_km))
})

test('map tiles use the klokantech basic style', async () => {
    const tiles = await request('/providers/service-location/map-tiles', 'GET', undefined, groomer)
    assert.equal(tiles.status, 200)
    assert.equal(
        tiles.body.data.url.startsWith('https://maps.geoapify.com/v1/tile/klokantech-basic/{z}/{x}/{y}.png?apiKey='),
        true,
    )
})

test('address autocomplete suggests the typed street', async () => {
    const result = await request(
        `/providers/service-location/autocomplete?text=${encodeURIComponent('Rua Vital Brasil, Porto Alegre')}`,
        'GET',
        undefined,
        groomer,
    )
    assert.equal(result.status, 200)
    assert.ok(result.body.data.some(item => String(item.address).includes('Vital Brasil') && Number.isFinite(item.latitude)))
})

test('postal code lookup fills the street and the city', async () => {
    const found = await request('/providers/service-location/postal-code?postal_code=91210-320', 'GET', undefined, groomer)
    assert.equal(found.status, 200)
    assert.equal(found.body.data.postal_code, '91210320')
    assert.equal(found.body.data.address, 'Rua Vital Brasil, Porto Alegre')
    const missing = await request('/providers/service-location/postal-code?postal_code=00000000', 'GET', undefined, groomer)
    assert.equal(missing.status, 400)
    assert.equal(missing.body.message, 'Não foi possível localizar este CEP.')
})

test('address, postal code and optional complement are stored', async () => {
    const missing = await save(paulista({ address: '  ' }))
    assert.equal(missing.status, 400)
    const saved = await save(paulista({ complement: 'Apto 2' }))
    assert.equal(saved.status, 200)
    assert.equal(saved.body.data.address, 'Avenida Paulista, São Paulo')
    assert.equal(saved.body.data.postal_code, '01310100')
    assert.equal(saved.body.data.complement, 'Apto 2')
    assert.equal(saved.body.data.label, 'Avenida Paulista, São Paulo')

    const cleared = await save(paulista({ complement: '   ' }))
    assert.equal(cleared.status, 200)
    assert.equal(cleared.body.data.complement, null)
    const read = await request('/providers/service-location', 'GET', undefined, groomer)
    assert.equal(read.status, 200)
    assert.equal(read.body.data.complement, null)
    assert.equal(read.body.data.postal_code, '01310100')
})

test('unknown or conflicting address is refused and leaves the saved point unchanged', async () => {
    const beforeSave = await save(paulista({ complement: 'Casa' }))
    assert.equal(beforeSave.status, 200)
    const unknown = await save(paulista({ address: 'Rua sem mapa, 10' }))
    assert.equal(unknown.status, 400)
    assert.equal(unknown.body.message, 'Não foi possível localizar este endereço.')
    const mixed = await save(paulista({ postal_code: '04344-000' }))
    assert.equal(mixed.status, 400)
    const row = await locationRow()
    assert.equal(row.rows[0].base_address, 'Avenida Paulista, São Paulo')
    assert.equal(row.rows[0].base_complement, 'Casa')
    assert.equal(row.rows[0].base_postal_code, '01310100')
})

test('radius is one of 3, 5, 8 or 10 and travel fee is included, on request or per km', async () => {
    const radius = await save(paulista({ radius_km: 4 }))
    assert.equal(radius.status, 400)
    const perKmMissing = await save(paulista({ travel_fee_mode: 'per_km', travel_fee_per_km: null }))
    assert.equal(perKmMissing.status, 400)
    const feeOnIncluded = await save(paulista({ travel_fee_mode: 'included', travel_fee_per_km: 9 }))
    assert.equal(feeOnIncluded.status, 400)

    const included = await save(paulista({ radius_km: 5, travel_fee_mode: 'included' }))
    assert.equal(included.status, 200)
    assert.equal(included.body.data.radius_km, 5)
    assert.equal(included.body.data.travel_fee_mode, 'included')
    assert.equal(included.body.data.travel_fee_per_km, null)

    const onRequest = await save(paulista({ radius_km: 3, travel_fee_mode: 'on_request' }))
    assert.equal(onRequest.status, 200)
    assert.equal(onRequest.body.data.travel_fee_mode, 'on_request')
    assert.equal(onRequest.body.data.travel_fee_per_km, null)

    const perKm = await save(paulista({ radius_km: 10, travel_fee_mode: 'per_km', travel_fee_per_km: 12.5 }))
    assert.equal(perKm.status, 200)
    assert.equal(perKm.body.data.radius_km, 10)
    assert.equal(perKm.body.data.travel_fee_mode, 'per_km')
    assert.equal(Number(perKm.body.data.travel_fee_per_km), 12.5)
})

test('saved radius is the limit used when a tutor searches', async () => {
    const widened = await save(paulista({ radius_km: 10, travel_fee_mode: 'included' }))
    assert.equal(widened.status, 200)
    const stored = await locationRow()
    const origin = Number(stored.rows[0].base_latitude)
    assert.ok(Number.isFinite(origin))
    const nineKmNorth = origin + (9 / 111.32)
    const nearby = `/providers/coverage?address=${encodeURIComponent('Ponto a 9 km')}&latitude=${nineKmNorth}&longitude=${stored.rows[0].base_longitude}&service_id=${id(5)}`

    const inside = await request(nearby, 'GET', undefined, tutor)
    assert.equal(inside.status, 200)
    assert.ok(inside.body.data.providers.some(item => item.name === 'Groomer de Teste'))

    const tightened = await save(paulista({ radius_km: 8, travel_fee_mode: 'included' }))
    assert.equal(tightened.status, 200)
    const outside = await request(nearby, 'GET', undefined, tutor)
    assert.equal(outside.status, 200)
    assert.equal(outside.body.data.providers.some(item => item.name === 'Groomer de Teste'), false)

    const home = await request(
        `/providers/coverage?address=${encodeURIComponent('Avenida Paulista, São Paulo')}&service_id=${id(5)}`,
        'GET',
        undefined,
        tutor,
    )
    assert.equal(home.status, 200)
    assert.ok(home.body.data.providers.some(item => item.name === 'Groomer de Teste'))
})
