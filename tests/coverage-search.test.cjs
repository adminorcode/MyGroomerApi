require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { Pool } = require('pg')

const base = 'http://127.0.0.1:3000/api/v1'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const password = 'admin'
const createdUsers = []
let tutor

const request = async (route, token) => {
    const response = await fetch(base + route, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(20000),
    })
    return { status: response.status, body: await response.json() }
}

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true', 'Test requires the explicitly configured local environment')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    const login = await fetch(base + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'tutor@email.com', password }),
        signal: AbortSignal.timeout(10000),
    })
    const session = await login.json()
    assert.equal(login.status, 200)
    tutor = session.token

    const farUser = crypto.randomUUID()
    const farProvider = crypto.randomUUID()
    const farOffer = crypto.randomUUID()
    createdUsers.push(farUser)
    await pool.query(
        `INSERT INTO users(id, name, email, role, email_verified_at)
         VALUES ($1, 'Groomer Distante', $2, 'provider', NOW())`,
        [farUser, `far-${farUser}@mygroomer.test`]
    )
    await pool.query(
        `INSERT INTO providers(id, user_id, is_verified, payout_method, base_address, base_latitude, base_longitude, radius_km)
         VALUES ($1, $2, true, 'mobile_money', 'Copacabana, Rio de Janeiro', -22.971177, -43.182543, 8)`,
        [farProvider, farUser]
    )
    await pool.query(
        `INSERT INTO provider_services(id, provider_id, service_id, price) VALUES ($1, $2, $3, 999)`,
        [farOffer, farProvider, id(5)]
    )
})

after(async () => {
    if (createdUsers.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers])
    await pool.end()
})

const coverage = (address, extra = '') =>
    request(`/providers/coverage?address=${encodeURIComponent(address)}${extra}`, tutor)

test('address inside the groomer radius lists that groomer and the published price', async () => {
    const banho = await coverage('Avenida Paulista, São Paulo', `&service_id=${id(5)}`)
    assert.equal(banho.status, 200)
    const names = banho.body.data.providers.map(item => item.name)
    assert.ok(names.includes('Groomer de Teste'))
    assert.equal(names.includes('Groomer Distante'), false)
    const offer = banho.body.data.providers.find(item => item.name === 'Groomer de Teste')
    assert.equal(Number(offer.price), 80)
    assert.equal(offer.service_name, 'Banho')
    assert.equal(Number(offer.average_rating), 5)

    const tosa = await coverage('Avenida Paulista, São Paulo', `&service_id=${id(6)}`)
    assert.equal(tosa.status, 200)
    const tosaOffer = tosa.body.data.providers.find(item => item.name === 'Groomer de Teste')
    assert.equal(tosaOffer.service_name, 'Tosa')
    assert.equal(Number(tosaOffer.price), 100)

    const modality = await coverage('Avenida Paulista, São Paulo', `&category_id=${id(4)}`)
    assert.equal(modality.status, 200)
    const cheapest = modality.body.data.providers.filter(item => item.name === 'Groomer de Teste')
    assert.equal(cheapest.length, 1)
    assert.equal(Number(cheapest[0].price), 80)
})

test('address outside the groomer radius omits that groomer', async () => {
    const away = await coverage('Jabaquara, São Paulo', `&service_id=${id(5)}`)
    assert.equal(away.status, 200)
    assert.deepEqual(away.body.data.providers.map(item => item.name), [])

    const rio = await coverage('Copacabana, Rio de Janeiro', `&service_id=${id(5)}`)
    assert.equal(rio.status, 200)
    const names = rio.body.data.providers.map(item => item.name)
    assert.ok(names.includes('Groomer Distante'))
    assert.equal(names.includes('Groomer de Teste'), false)
})

test('coverage search rejects a missing filter and an unknown address', async () => {
    const missing = await coverage('Avenida Paulista, São Paulo')
    assert.equal(missing.status, 400)
    const unknown = await coverage('Rua sem mapa, 10', `&service_id=${id(5)}`)
    assert.equal(unknown.status, 400)
    assert.equal(unknown.body.message, 'Não foi possível localizar este endereço.')
    const pinheiros = await coverage('Rua dos Pinheiros, 500, São Paulo', `&service_id=${id(5)}`)
    assert.equal(pinheiros.status, 200)
    assert.equal(pinheiros.body.data.providers.some(item => item.name === 'Groomer Distante'), false)
})
