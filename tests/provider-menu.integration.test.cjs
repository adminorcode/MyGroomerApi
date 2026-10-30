require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { Pool } = require('pg')
const bcrypt = require('bcrypt')

const base = 'http://127.0.0.1:3000/api/v1'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const demoProviderId = id(3)
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const password = 'admin'
const createdTypeIds = []
let tutor
let groomer
let admin
let adminUserId
let originalOffers = []

const request = async (route, method = 'GET', body, token) => {
    const response = await fetch(base + route, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : {} }
}

const login = async email => {
    const result = await request('/auth/login', 'POST', { email, password })
    assert.equal(result.status, 200, email)
    return result.body.token
}

const payloadOf = offer => ({
    id: offer.id,
    service_id: offer.service_id,
    custom_name: offer.custom_name,
    category_id: offer.category_id,
    professional_type_id: offer.professional_type_id,
    description: offer.description,
    is_active: offer.is_active,
    prices: offer.prices,
    durations_minutes: offer.durations_minutes,
})

const restoreMenu = async () => {
    if (!originalOffers.length || !groomer) return
    await pool.query(
        `DELETE FROM provider_services WHERE provider_id = $1 AND custom_name = 'Hidratação teste'`,
        [demoProviderId],
    )
    await request('/providers/menu', 'PUT', { offers: originalOffers.map(payloadOf) }, groomer)
}

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true', 'Test requires the explicitly configured local environment')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    tutor = await login('tutor@email.com')
    groomer = await login('groomer@email.com')
    adminUserId = crypto.randomUUID()
    const email = `admin-menu-${adminUserId}@mygroomer.test`
    await pool.query(
        `INSERT INTO users(id, name, email, password, role, email_verified_at, address, phone_number)
         VALUES ($1, 'Admin cardápio', $2, $3, 'admin', NOW(), 'Endereco ficticio - teste local', '+5511999990001')`,
        [adminUserId, email, await bcrypt.hash(password, 10)],
    )
    admin = await login(email)
    const menu = await request('/providers/menu', 'GET', undefined, groomer)
    assert.equal(menu.status, 200)
    originalOffers = menu.body.data.offers
})

after(async () => {
    await restoreMenu()
    if (createdTypeIds.length) {
        await pool.query('UPDATE provider_services SET professional_type_id = NULL WHERE professional_type_id = ANY($1::uuid[])', [createdTypeIds])
        await pool.query('DELETE FROM provider_professional_types WHERE professional_type_id = ANY($1::uuid[])', [createdTypeIds])
        await pool.query('DELETE FROM professional_types WHERE id = ANY($1::uuid[])', [createdTypeIds])
    }
    if (adminUserId) await pool.query('DELETE FROM users WHERE id = $1', [adminUserId])
    await pool.end()
})

test('provider menu keeps size, type and active state visible only when published', async () => {
    const menu = await request('/providers/menu', 'GET', undefined, groomer)
    assert.equal(menu.status, 200)
    const banho = menu.body.data.offers.find(offer => offer.name === 'Banho')
    const groomerType = menu.body.data.types.find(type => type.name === 'Groomer')
    assert.ok(banho)
    assert.ok(groomerType)
    assert.equal(banho.is_active, true)
    assert.equal(banho.professional_type_id, groomerType.id)
    assert.equal(banho.professional_type_name, 'Groomer')
    assert.equal(Number(banho.prices.small), 80)
    assert.equal(Number(banho.prices.medium), 80)
    assert.equal(Number(banho.prices.large), 80)
    assert.equal(Number(banho.durations_minutes.small), 40)
    assert.equal(Number(banho.durations_minutes.medium), 60)
    assert.equal(Number(banho.durations_minutes.large), 90)
    assert.equal(typeof banho.description, 'string')
    assert.ok(banho.description.length > 0)

    const incomplete = await request('/providers/menu', 'PUT', {
        offers: [{ ...payloadOf(banho), prices: { ...banho.prices, large: null } }],
    }, groomer)
    assert.equal(incomplete.status, 400)
    assert.match(incomplete.body.message, /porte/)

    const withoutType = await request('/providers/menu', 'PUT', {
        offers: [{ ...payloadOf(banho), professional_type_id: null }],
    }, groomer)
    assert.equal(withoutType.status, 400)
    assert.match(withoutType.body.message, /tipo/)

    const outsider = await request('/professional-types', 'POST', { name: 'Tipo fora 011' }, admin)
    assert.equal(outsider.status, 201)
    createdTypeIds.push(outsider.body.data.id)
    const refusedType = await request('/providers/menu', 'PUT', {
        offers: [{ ...payloadOf(banho), professional_type_id: outsider.body.data.id }],
    }, groomer)
    assert.equal(refusedType.status, 400)
    assert.match(refusedType.body.message, /não escolheu/)

    const inactiveType = await request('/professional-types', 'POST', { name: 'Tipo inativo 011' }, admin)
    assert.equal(inactiveType.status, 201)
    createdTypeIds.push(inactiveType.body.data.id)
    await pool.query(
        `INSERT INTO provider_professional_types(provider_id, professional_type_id) VALUES ($1, $2)`,
        [demoProviderId, inactiveType.body.data.id],
    )
    const deactivated = await request(`/professional-types/${inactiveType.body.data.id}`, 'PATCH', { is_active: false }, admin)
    assert.equal(deactivated.status, 200)
    const refusedInactive = await request('/providers/menu', 'PUT', {
        offers: [{ ...payloadOf(banho), professional_type_id: inactiveType.body.data.id }],
    }, groomer)
    assert.equal(refusedInactive.status, 400)
    assert.match(refusedInactive.body.message, /inativo/)

    const category = menu.body.data.categories[0]
    assert.ok(category)
    const custom = {
        service_id: null,
        custom_name: 'Hidratação teste',
        category_id: category.id,
        professional_type_id: groomerType.id,
        description: 'Hidratação da pelagem',
        is_active: true,
        prices: { small: 70, medium: 90, large: 120 },
        durations_minutes: { small: 30, medium: 45, large: 60 },
    }
    const saved = await request('/providers/menu', 'PUT', {
        offers: [...menu.body.data.offers.map(payloadOf), custom],
    }, groomer)
    assert.equal(saved.status, 200)
    const created = saved.body.data.offers.find(offer => offer.name === 'Hidratação teste')
    assert.ok(created)
    assert.equal(created.professional_type_name, 'Groomer')
    assert.equal(Number(created.prices.large), 120)
    assert.equal(Number(created.durations_minutes.medium), 45)
    assert.equal(saved.body.data.types.some(type => type.name === 'Tipo fora 011'), false)
    assert.equal(saved.body.data.types.some(type => type.name === 'Tipo inativo 011'), false)

    const hidden = await request('/providers/menu', 'PUT', {
        offers: [{ ...payloadOf(banho), is_active: false }],
    }, groomer)
    assert.equal(hidden.status, 200)
    const coverage = await request(`/providers/coverage?address=${encodeURIComponent('Avenida Paulista, São Paulo')}&service_id=${banho.service_id}`, 'GET', undefined, tutor)
    assert.equal(coverage.status, 200)
    assert.equal(coverage.body.data.providers.some(item => item.name === 'Groomer de Teste'), false)
    const listed = await request(`/providers/service/${banho.service_id}/providers`, 'GET', undefined, tutor)
    assert.equal(listed.status, 200)
    assert.equal(listed.body.data.some(item => item.name === 'Groomer de Teste'), false)
    assert.equal((await request(`/providers/${banho.id}`, 'GET', undefined, tutor)).status, 404)
    assert.equal((await request(`/providers/${banho.id}`, 'GET', undefined, groomer)).status, 200)
    const pet = await request('/pets', 'POST', {
        name: 'Rex cardápio',
        species: 'dog',
        breed: 'SRD',
        size: 'medium',
        age_years: 3,
        notes: 'Teste de serviço inativo',
    }, tutor)
    assert.equal(pet.status, 201)
    const refusedBooking = await request('/bookings', 'POST', {
        pet_id: pet.body.data.id,
        provider_service_id: banho.id,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        customer_location: 'Avenida Paulista, São Paulo',
    }, tutor)
    assert.equal(refusedBooking.status, 404)
    await pool.query('DELETE FROM pets WHERE id = $1', [pet.body.data.id])

    await restoreMenu()
    const restored = await request(`/providers/coverage?address=${encodeURIComponent('Avenida Paulista, São Paulo')}&service_id=${banho.service_id}`, 'GET', undefined, tutor)
    assert.equal(restored.status, 200)
    assert.equal(restored.body.data.providers.some(item => item.name === 'Groomer de Teste'), true)
})
