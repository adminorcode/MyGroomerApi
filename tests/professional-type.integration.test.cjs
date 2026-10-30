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
const groomerTypeId = '10000000-0000-4000-8000-000000000050'
const demoProviderId = '10000000-0000-4000-8000-000000000003'
const demoOfferId = '10000000-0000-4000-8000-000000000010'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const password = 'admin'
const createdTypeIds = []
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

const runSeed = async () => {
    await execFileAsync(process.execPath, ['node_modules/ts-node/dist/bin.js', 'src/scripts/seed-local.ts'], {
        cwd: process.cwd(),
        env: process.env,
    })
}

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true', 'Test requires the explicitly configured local environment')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    tutor = await login('tutor@email.com')
    groomer = await login('groomer@email.com')
    adminUserId = crypto.randomUUID()
    const email = `admin-types-${adminUserId}@mygroomer.test`
    await pool.query(
        `INSERT INTO users(id, name, email, password, role, email_verified_at, address, phone_number)
         VALUES ($1, 'Admin catálogo', $2, $3, 'admin', NOW(), 'Endereco ficticio - teste local', '+5511999990000')`,
        [adminUserId, email, await bcrypt.hash(password, 10)],
    )
    admin = await login(email)
})

after(async () => {
    if (createdTypeIds.length) {
        await pool.query('UPDATE provider_services SET professional_type_id = NULL WHERE professional_type_id = ANY($1::uuid[])', [createdTypeIds])
        await pool.query('DELETE FROM provider_professional_types WHERE professional_type_id = ANY($1::uuid[])', [createdTypeIds])
        await pool.query('DELETE FROM professional_types WHERE id = ANY($1::uuid[])', [createdTypeIds])
    }
    await pool.query(
        `UPDATE professional_types SET name = 'Groomer', is_active = true, updated_at = NOW() WHERE id = $1`,
        [groomerTypeId],
    )
    await pool.query('UPDATE provider_services SET professional_type_id = NULL WHERE id = $1', [demoOfferId])
    if (adminUserId) await pool.query('DELETE FROM users WHERE id = $1', [adminUserId])
    await pool.end()
})

test('professional type catalog enforces admin writes, active listing, links and idempotent seed', async () => {
    await runSeed()
    const anonymous = await request('/professional-types')
    assert.equal(anonymous.status, 401)

    const refused = await request('/professional-types', 'POST', { name: 'Veterinário' }, tutor)
    assert.equal(refused.status, 401)

    const empty = await request('/professional-types', 'POST', { name: '   ' }, admin)
    assert.equal(empty.status, 400)
    assert.ok(empty.body.errors.some(issue => issue.field === 'name'))

    const created = await request('/professional-types', 'POST', { name: 'Veterinário teste' }, admin)
    assert.equal(created.status, 201)
    assert.equal(created.body.data.is_active, true)
    const typeId = created.body.data.id
    createdTypeIds.push(typeId)

    const duplicate = await request('/professional-types', 'POST', { name: 'veterinário teste' }, admin)
    assert.equal(duplicate.status, 409)

    const renamed = await request(`/professional-types/${typeId}`, 'PATCH', { name: 'Banhista teste' }, admin)
    assert.equal(renamed.status, 200)
    assert.equal(renamed.body.data.name, 'Banhista teste')
    assert.equal(renamed.body.data.is_active, true)

    const deactivated = await request(`/professional-types/${typeId}`, 'PATCH', { is_active: false }, admin)
    assert.equal(deactivated.status, 200)
    assert.equal(deactivated.body.data.is_active, false)

    const activeList = await request('/professional-types', 'GET', undefined, tutor)
    assert.equal(activeList.status, 200)
    assert.equal(activeList.body.data.some(type => type.id === typeId), false)

    const groomerList = await request('/professional-types', 'GET', undefined, groomer)
    assert.equal(groomerList.status, 200)
    assert.equal(groomerList.body.data.some(type => type.id === typeId), false)

    const hiddenFromAdmin = await request('/professional-types', 'GET', undefined, admin)
    assert.equal(hiddenFromAdmin.body.data.some(type => type.id === typeId), false)

    const refusedInactive = await request('/professional-types?include_inactive=true', 'GET', undefined, tutor)
    assert.equal(refusedInactive.status, 403)

    const inactiveList = await request('/professional-types?include_inactive=true', 'GET', undefined, admin)
    assert.equal(inactiveList.status, 200)
    assert.equal(inactiveList.body.data.some(type => type.id === typeId && type.is_active === false), true)

    await pool.query(
        `INSERT INTO provider_professional_types(provider_id, professional_type_id) VALUES ($1, $2)`,
        [demoProviderId, typeId],
    )
    const servicesBefore = await pool.query('SELECT id, service_id, price FROM provider_services WHERE provider_id = $1 ORDER BY id', [demoProviderId])
    const blockedByProvider = await request(`/professional-types/${typeId}`, 'DELETE', undefined, admin)
    assert.equal(blockedByProvider.status, 409)
    const providerLink = await pool.query(
        'SELECT 1 FROM provider_professional_types WHERE provider_id = $1 AND professional_type_id = $2',
        [demoProviderId, typeId],
    )
    assert.equal(providerLink.rowCount, 1)
    const servicesAfterProviderBlock = await pool.query(
        'SELECT id, service_id, price FROM provider_services WHERE provider_id = $1 ORDER BY id',
        [demoProviderId],
    )
    assert.deepEqual(servicesAfterProviderBlock.rows, servicesBefore.rows)
    const stillThere = await pool.query('SELECT is_active FROM professional_types WHERE id = $1', [typeId])
    assert.equal(stillThere.rows[0].is_active, false)

    await pool.query('DELETE FROM provider_professional_types WHERE professional_type_id = $1', [typeId])
    const offerBefore = await pool.query('SELECT id, service_id, price, professional_type_id FROM provider_services WHERE id = $1', [demoOfferId])
    await pool.query('UPDATE provider_services SET professional_type_id = $2 WHERE id = $1', [demoOfferId, typeId])
    const blockedByService = await request(`/professional-types/${typeId}`, 'DELETE', undefined, admin)
    assert.equal(blockedByService.status, 409)
    const offerAfter = await pool.query('SELECT id, service_id, price, professional_type_id FROM provider_services WHERE id = $1', [demoOfferId])
    assert.equal(offerAfter.rows[0].service_id, offerBefore.rows[0].service_id)
    assert.equal(Number(offerAfter.rows[0].price), Number(offerBefore.rows[0].price))
    assert.equal(offerAfter.rows[0].professional_type_id, typeId)
    await pool.query('UPDATE provider_services SET professional_type_id = NULL WHERE id = $1', [demoOfferId])

    const activated = await request(`/professional-types/${typeId}`, 'PATCH', { is_active: true }, admin)
    assert.equal(activated.status, 200)
    const visible = await request('/professional-types', 'GET', undefined, tutor)
    assert.equal(visible.body.data.some(type => type.id === typeId && type.name === 'Banhista teste'), true)

    const removed = await request(`/professional-types/${typeId}`, 'DELETE', undefined, admin)
    assert.equal(removed.status, 200)
    const gone = await pool.query('SELECT 1 FROM professional_types WHERE id = $1', [typeId])
    assert.equal(gone.rowCount, 0)
    createdTypeIds.pop()

    await runSeed()
    const seeded = await pool.query(
        `SELECT professional_types.name, professional_types.is_active
         FROM professional_types
         JOIN provider_professional_types ON provider_professional_types.professional_type_id = professional_types.id
         JOIN providers ON providers.id = provider_professional_types.provider_id
         JOIN users ON users.id = providers.user_id
         WHERE professional_types.id = $1 AND users.email = 'groomer@email.com'`,
        [groomerTypeId],
    )
    assert.equal(seeded.rowCount, 1)
    assert.equal(seeded.rows[0].name, 'Groomer')
    assert.equal(seeded.rows[0].is_active, true)

    const beforeSecondSeed = await pool.query('SELECT COUNT(*)::int AS total FROM professional_types')
    await runSeed()
    const afterSecondSeed = await pool.query('SELECT COUNT(*)::int AS total FROM professional_types')
    assert.equal(afterSecondSeed.rows[0].total, beforeSecondSeed.rows[0].total)

    await pool.query(
        `UPDATE professional_types SET name = 'Groomer preservado', is_active = false, updated_at = NOW() WHERE id = $1`,
        [groomerTypeId],
    )
    const extra = await request('/professional-types', 'POST', { name: 'Tipo extra seed' }, admin)
    assert.equal(extra.status, 201)
    createdTypeIds.push(extra.body.data.id)
    await pool.query(
        `INSERT INTO provider_professional_types(provider_id, professional_type_id) VALUES ($1, $2)`,
        [demoProviderId, extra.body.data.id],
    )
    await runSeed()
    const preserved = await pool.query('SELECT name, is_active FROM professional_types WHERE id = $1', [groomerTypeId])
    assert.equal(preserved.rows[0].name, 'Groomer preservado')
    assert.equal(preserved.rows[0].is_active, false)
    const extraRemains = await pool.query('SELECT 1 FROM professional_types WHERE id = $1', [extra.body.data.id])
    assert.equal(extraRemains.rowCount, 1)
    const links = await pool.query(
        `SELECT professional_type_id FROM provider_professional_types WHERE provider_id = $1 ORDER BY professional_type_id`,
        [demoProviderId],
    )
    assert.deepEqual(links.rows.map(row => row.professional_type_id).sort(), [groomerTypeId, extra.body.data.id].sort())
})
