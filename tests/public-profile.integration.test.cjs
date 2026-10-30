require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { Pool } = require('pg')

const base = 'http://127.0.0.1:3000/api/v1'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const demoProviderId = id(3)
const banhoId = id(10)
const tosaId = id(11)
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const password = 'admin'
const customName = 'Hidratação perfil'
let tutor
let groomer
let originalRules = null
let originalTosaActive = true
let originalLarge = null

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

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true', 'Test requires the explicitly configured local environment')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    tutor = await login('tutor@email.com')
    groomer = await login('groomer@email.com')
    const provider = await pool.query('SELECT attendance_rules FROM providers WHERE id = $1', [demoProviderId])
    originalRules = provider.rows[0].attendance_rules
    const tosa = await pool.query('SELECT is_active FROM provider_services WHERE id = $1', [tosaId])
    originalTosaActive = tosa.rows[0].is_active
    const banho = await pool.query('SELECT price_large FROM provider_services WHERE id = $1', [banhoId])
    originalLarge = banho.rows[0].price_large
})

after(async () => {
    await pool.query('UPDATE providers SET attendance_rules = $2 WHERE id = $1', [demoProviderId, originalRules])
    await pool.query('UPDATE provider_services SET is_active = $2 WHERE id = $1', [tosaId, originalTosaActive])
    await pool.query('UPDATE provider_services SET price_large = $2 WHERE id = $1', [banhoId, originalLarge])
    await pool.query('DELETE FROM provider_services WHERE provider_id = $1 AND custom_name = $2', [demoProviderId, customName])
    await pool.end()
})

test('public profile lists active services, base price, reputation and attendance rules', async () => {
    const anonymous = await request(`/providers/${banhoId}/profile`)
    assert.equal(anonymous.status, 401)

    const missing = await request(`/providers/${crypto.randomUUID()}/profile`, 'GET', undefined, tutor)
    assert.equal(missing.status, 404)

    const invalid = await request('/providers/nao-e-uuid/profile', 'GET', undefined, tutor)
    assert.equal(invalid.status, 400)

    await pool.query('UPDATE providers SET attendance_rules = $2 WHERE id = $1', [demoProviderId, 'Cães apenas, com o tutor presente.'])
    await pool.query('UPDATE provider_services SET price_large = 999 WHERE id = $1', [banhoId])

    const profile = await request(`/providers/${banhoId}/profile`, 'GET', undefined, tutor)
    assert.equal(profile.status, 200)
    const data = profile.body.data
    assert.equal(data.provider_id, demoProviderId)
    assert.equal(data.name, 'Groomer de Teste')
    assert.equal(data.is_verified, true)
    assert.equal(Number(data.average_rating), 5)
    assert.equal(data.review_count, 1)
    assert.equal(data.attendance_rules, 'Cães apenas, com o tutor presente.')
    assert.equal(data.base_address, undefined)
    assert.equal(data.momo_number, undefined)
    assert.equal(data.bank_account_number, undefined)
    assert.equal(data.user_id, undefined)

    const names = data.services.map(service => service.name)
    assert.ok(names.includes('Banho'))
    assert.ok(names.includes('Tosa'))
    assert.ok(names.includes('Banho e tosa'))
    const banho = data.services.find(service => service.name === 'Banho')
    assert.equal(banho.id, banhoId)
    assert.equal(banho.price, 80)

    await pool.query(`UPDATE providers SET attendance_rules = '   ' WHERE id = $1`, [demoProviderId])
    const blank = await request(`/providers/${banhoId}/profile`, 'GET', undefined, tutor)
    assert.equal(blank.status, 200)
    assert.equal(blank.body.data.attendance_rules, null)

    await pool.query('UPDATE provider_services SET is_active = false WHERE id = $1', [tosaId])
    const hidden = await request(`/providers/${banhoId}/profile`, 'GET', undefined, tutor)
    assert.equal(hidden.body.data.services.find(service => service.name === 'Tosa'), undefined)
    const inactiveEntry = await request(`/providers/${tosaId}/profile`, 'GET', undefined, tutor)
    assert.equal(inactiveEntry.status, 404)
    const owner = await request(`/providers/${tosaId}/profile`, 'GET', undefined, groomer)
    assert.equal(owner.status, 200)
    assert.equal(owner.body.data.services.find(service => service.name === 'Tosa'), undefined)

    const menu = await request('/providers/menu', 'GET', undefined, groomer)
    assert.equal(menu.status, 200)
    const groomerType = menu.body.data.types.find(type => type.name === 'Groomer')
    const category = menu.body.data.categories[0]
    assert.ok(groomerType)
    assert.ok(category)
    const saved = await request('/providers/menu', 'PUT', {
        offers: [{
            custom_name: customName,
            category_id: category.id,
            professional_type_id: groomerType.id,
            description: 'Hidratação demonstrativa do perfil',
            is_active: true,
            prices: { small: 30, medium: 45, large: 70 },
            durations_minutes: { small: 20, medium: 30, large: 40 },
        }],
    }, groomer)
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    const created = await pool.query(
        'SELECT id, price FROM provider_services WHERE provider_id = $1 AND custom_name = $2',
        [demoProviderId, customName],
    )
    assert.equal(created.rowCount, 1)
    const customId = created.rows[0].id
    assert.equal(Number(created.rows[0].price), 30)

    const withCustom = await request(`/providers/${banhoId}/profile`, 'GET', undefined, tutor)
    const custom = withCustom.body.data.services.find(service => service.name === customName)
    assert.ok(custom)
    assert.equal(custom.id, customId)
    assert.equal(custom.price, 30)

    const detail = await request(`/providers/${customId}`, 'GET', undefined, tutor)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.data.service_name, customName)
    assert.equal(detail.body.data.provider_name, 'Groomer de Teste')
})
