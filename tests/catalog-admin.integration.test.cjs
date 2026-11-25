require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { Pool } = require('pg')
const bcrypt = require('bcrypt')

const execFileAsync = promisify(execFile)
const base = 'http://127.0.0.1:3000/api/v1'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const seedCategoryId = id(4)
const seedServiceId = id(5)
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const password = 'admin'
const createdCategoryIds = []
const createdServiceIds = []
let tutor
let groomer
let admin
let adminUserId

const request = async (route, method = 'GET', body, token) => {
    const response = await fetch(base + route, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : {} }
}

const login = async email => {
    const result = await request('/auth/login', 'POST', { email, password })
    assert.equal(result.status, 200, email)
    return result.body.token
}

const runSeed = async () => {
    await execFileAsync(process.execPath, ['node_modules/ts-node/dist/bin.js', 'src/scripts/seed-local.ts'], {
        cwd: process.cwd(),
        env: process.env,
    })
}

const adminCount = async () => {
    const result = await pool.query(`SELECT count(*)::int AS total FROM users WHERE role = 'admin'`)
    return result.rows[0].total
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

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true', 'Test requires the explicitly configured local environment')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    tutor = await login('tutor@email.com')
    groomer = await login('groomer@email.com')
    adminUserId = crypto.randomUUID()
    const email = `admin-catalog-${adminUserId}@mygroomer.test`
    await pool.query(
        `INSERT INTO users(id, name, email, password, role, email_verified_at, address, phone_number)
         VALUES ($1, 'Admin catálogo', $2, $3, 'admin', NOW(), 'Endereco ficticio - teste local', '+5511999990002')`,
        [adminUserId, email, await bcrypt.hash(password, 10)],
    )
    admin = await login(email)
})

after(async () => {
    if (createdServiceIds.length) {
        await pool.query('DELETE FROM provider_services WHERE service_id = ANY($1::uuid[])', [createdServiceIds])
        await pool.query('DELETE FROM services WHERE id = ANY($1::uuid[])', [createdServiceIds])
    }
    if (createdCategoryIds.length) {
        await pool.query('DELETE FROM services WHERE category_id = ANY($1::uuid[])', [createdCategoryIds])
        await pool.query('DELETE FROM categories WHERE id = ANY($1::uuid[])', [createdCategoryIds])
    }
    await pool.query('UPDATE categories SET is_active = true, name = $2, updated_at = NOW() WHERE id = $1', [seedCategoryId, 'Banho e Tosa'])
    await pool.query('UPDATE services SET is_active = true, updated_at = NOW() WHERE id = ANY($1::uuid[])', [[id(5), id(6), id(7)]])
    if (adminUserId) await pool.query('DELETE FROM users WHERE id = $1', [adminUserId])
    await pool.end()
})

test('admin catalog enforces writes, active listing, delete protection and idempotent seed', async () => {
    const stamp = crypto.randomUUID().slice(0, 8)
    const categoryName = `AAA categoria ${stamp}`
    const serviceName = `AAA servico ${stamp}`

    assert.equal((await request('/categories', 'POST', { name: categoryName })).status, 401)
    assert.equal((await request('/categories', 'POST', { name: categoryName }, tutor)).status, 403)
    assert.equal((await request('/services', 'POST', { name: serviceName, category_id: seedCategoryId }, groomer)).status, 403)
    assert.equal((await request('/categories', 'POST', { name: '   ' }, admin)).status, 400)

    const createdCategory = await request('/categories', 'POST', { name: categoryName, description: 'Temporaria' }, admin)
    assert.equal(createdCategory.status, 201)
    assert.equal(createdCategory.body.data.is_active, true)
    const categoryId = createdCategory.body.data.id
    createdCategoryIds.push(categoryId)

    const duplicateCategory = await request('/categories', 'POST', { name: categoryName.toUpperCase() }, admin)
    assert.equal(duplicateCategory.status, 409)

    const createdService = await request('/services', 'POST', {
        name: serviceName,
        description: 'Temporario',
        category_id: categoryId,
    }, admin)
    assert.equal(createdService.status, 201)
    assert.equal(createdService.body.data.is_active, true)
    const serviceId = createdService.body.data.id
    createdServiceIds.push(serviceId)
    assert.equal((await request('/services', 'POST', { name: serviceName.toLowerCase(), category_id: categoryId }, admin)).status, 409)

    const renamed = await request(`/categories/${categoryId}`, 'PATCH', { name: `AAA categoria nova ${stamp}` }, admin)
    assert.equal(renamed.status, 200)
    const deactivatedCategory = await request(`/categories/${categoryId}`, 'PATCH', { is_active: false }, admin)
    assert.equal(deactivatedCategory.status, 200)
    assert.equal(deactivatedCategory.body.data.is_active, false)

    const hiddenCategories = await request('/categories', 'GET', undefined, tutor)
    assert.equal(hiddenCategories.status, 200)
    assert.equal(hiddenCategories.body.data.some(item => item.id === categoryId), false)
    assert.equal((await request('/categories?include_inactive=true', 'GET', undefined, groomer)).status, 403)
    const inactiveCategories = await request('/categories?include_inactive=true', 'GET', undefined, admin)
    assert.equal(inactiveCategories.status, 200)
    assert.equal(inactiveCategories.body.data.some(item => item.id === categoryId), true)

    const deactivatedService = await request(`/services/${serviceId}`, 'PATCH', { is_active: false }, admin)
    assert.equal(deactivatedService.status, 200)
    const hiddenServices = await request('/services?limit=50', 'GET', undefined, tutor)
    assert.equal(hiddenServices.body.data.some(item => item.id === serviceId), false)
    assert.equal((await request('/services?include_inactive=true&limit=50', 'GET', undefined, tutor)).status, 403)
    const inactiveServices = await request('/services?include_inactive=true&limit=50', 'GET', undefined, admin)
    assert.equal(inactiveServices.body.data.some(item => item.id === serviceId), true)
    await request(`/services/${serviceId}`, 'PATCH', { is_active: true }, admin)
    await request(`/categories/${categoryId}`, 'PATCH', { is_active: true }, admin)

    const blockedCategory = await request(`/categories/${categoryId}`, 'DELETE', undefined, admin)
    assert.equal(blockedCategory.status, 409)
    assert.equal((await request(`/categories/${categoryId}`, 'GET', undefined, admin)).status, 200)

    const menuBefore = await request('/providers/menu', 'GET', undefined, groomer)
    assert.equal(menuBefore.status, 200)
    const offers = menuBefore.body.data.offers.map(payloadOf)
    await request(`/services/${serviceId}`, 'PATCH', { is_active: false }, admin)
    const refusedInactive = await request('/providers/menu', 'PUT', {
        offers: [...offers, { service_id: serviceId, is_active: false }],
    }, groomer)
    assert.equal(refusedInactive.status, 400)

    const menuSuggestions = await request('/providers/menu', 'GET', undefined, groomer)
    assert.equal(menuSuggestions.body.data.suggestions.some(item => item.service_id === serviceId), false)
    assert.equal(menuSuggestions.body.data.categories.some(item => item.id === categoryId), true)

    await request(`/categories/${categoryId}`, 'PATCH', { is_active: false }, admin)
    const hiddenSuggestionCategory = await request('/providers/menu', 'GET', undefined, groomer)
    assert.equal(hiddenSuggestionCategory.body.data.categories.some(item => item.id === categoryId), false)
    await request(`/categories/${categoryId}`, 'PATCH', { is_active: true }, admin)

    await request(`/services/${seedServiceId}`, 'PATCH', { is_active: false }, admin)
    const menuKeepsOffer = await request('/providers/menu', 'GET', undefined, groomer)
    assert.equal(menuKeepsOffer.body.data.offers.some(item => item.service_id === seedServiceId), true)
    assert.equal(menuKeepsOffer.body.data.suggestions.some(item => item.service_id === seedServiceId), false)
    const savedMenu = await request('/providers/menu', 'PUT', { offers }, groomer)
    assert.equal(savedMenu.status, 200)
    const listedAfter = await request(`/providers/service/${seedServiceId}/providers`, 'GET', undefined, tutor)
    assert.equal(listedAfter.status, 200)
    assert.equal(listedAfter.body.data.some(item => item.service_id === seedServiceId && item.name === 'Groomer de Teste'), true)
    await request(`/services/${seedServiceId}`, 'PATCH', { is_active: true }, admin)

    const blockedService = await request(`/services/${seedServiceId}`, 'DELETE', undefined, admin)
    assert.equal(blockedService.status, 409)
    assert.equal((await request(`/services/${crypto.randomUUID()}`, 'DELETE', undefined, admin)).status, 404)
    assert.equal((await request(`/categories/${crypto.randomUUID()}`, 'DELETE', undefined, admin)).status, 404)

    const removedService = await request(`/services/${serviceId}`, 'DELETE', undefined, admin)
    assert.equal(removedService.status, 200)
    createdServiceIds.pop()
    const removedCategory = await request(`/categories/${categoryId}`, 'DELETE', undefined, admin)
    assert.equal(removedCategory.status, 200)
    createdCategoryIds.pop()

    const adminsBefore = await adminCount()
    await request(`/categories/${seedCategoryId}`, 'PATCH', { is_active: true }, admin)
    await runSeed()
    const stillActive = await request(`/categories/${seedCategoryId}`, 'GET', undefined, admin)
    assert.equal(stillActive.body.data.is_active, true)
    assert.equal(stillActive.body.data.name, 'Banho e Tosa')
    await request(`/categories/${seedCategoryId}`, 'PATCH', { name: 'Banho e Tosa alterada', is_active: false }, admin)
    await runSeed()
    const preserved = await request(`/categories/${seedCategoryId}`, 'GET', undefined, admin)
    assert.equal(preserved.body.data.name, 'Banho e Tosa alterada')
    assert.equal(preserved.body.data.is_active, false)
    assert.equal(await adminCount(), adminsBefore)
    await request(`/categories/${seedCategoryId}`, 'PATCH', { name: 'Banho e Tosa', is_active: true }, admin)
})
