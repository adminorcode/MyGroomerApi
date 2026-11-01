require('dotenv').config({ quiet: true })
const { test, before, after, describe } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { Pool } = require('pg')

const base = 'http://127.0.0.1:3000/api/v1'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const demoProviderId = id(3)
const banhoId = id(10)
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const password = 'Profile#2026'
const createdEmails = []
const typeIds = [crypto.randomUUID(), crypto.randomUUID()]
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const pngFile = { name: 'foto.png', mime_type: 'image/png', size: png.length, base64: png.toString('base64') }
let tutor
let groomer
let owner
let other
let originalRules
let originalVerified
let originalLarge
let originalPhoto
let originalRoutine
let originalDays

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
    return { status: response.status, body: text ? JSON.parse(text) : {}, headers: response.headers }
}

const bytes = async (route, token) => {
    const response = await fetch(base + route, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15000),
    })
    return {
        status: response.status,
        type: response.headers.get('content-type'),
        body: Buffer.from(await response.arrayBuffer()),
    }
}

const login = async (email, secret = 'admin') => {
    const result = await request('/auth/login', 'POST', { email, password: secret })
    assert.equal(result.status, 200, JSON.stringify(result.body))
    return result.body.token
}

const signup = async () => {
    const email = `profile-${crypto.randomUUID()}@mygroomer.test`
    createdEmails.push(email)
    const result = await request('/auth/register', 'POST', {
        name: 'Perfil de Teste',
        email,
        password,
        role: 'provider',
        phone_number: '+5511987654321',
        registration: {
            document: '52998224725',
            experience: 'Experiência com atendimento domiciliar.',
            certifications: 'Curso de banho e tosa.',
            professional_type_ids: typeIds,
            attachments: [],
        },
    })
    assert.equal(result.status, 201, JSON.stringify(result.body))
    const token = await login(email, password)
    const providerId = (await pool.query(
        'SELECT p.id FROM providers p JOIN users u ON p.user_id = u.id WHERE u.email = $1',
        [email],
    )).rows[0].id
    return { email, token, providerId }
}

const day = (enabled, start = null, end = null) => ({
    enabled, start, end, break_start: null, break_end: null,
})

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true', 'Test requires the explicitly configured local environment')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    await pool.query(
        'INSERT INTO professional_types(id, name, is_active) VALUES ($1, $3, true), ($2, $4, true)',
        [typeIds[0], typeIds[1], `Perfil tipo ${typeIds[0]}`, `Perfil tipo ${typeIds[1]}`],
    )
    tutor = await login('tutor@email.com')
    groomer = await login('groomer@email.com')
    owner = await signup()
    other = await signup()
    const provider = await pool.query(
        `SELECT attendance_rules, is_verified, public_photo, public_photo_mime, public_photo_id,
                travel_gap_minutes, manual_fit
         FROM providers WHERE id = $1`,
        [demoProviderId],
    )
    originalRules = provider.rows[0].attendance_rules
    originalVerified = provider.rows[0].is_verified
    originalPhoto = provider.rows[0]
    originalRoutine = {
        travel_gap_minutes: provider.rows[0].travel_gap_minutes,
        manual_fit: provider.rows[0].manual_fit,
    }
    originalDays = (await pool.query(
        'SELECT weekday, start_minute, end_minute, break_start_minute, break_end_minute FROM provider_weekdays WHERE provider_id = $1',
        [demoProviderId],
    )).rows
    originalLarge = (await pool.query('SELECT price_large FROM provider_services WHERE id = $1', [banhoId])).rows[0].price_large
})

after(async () => {
    await pool.query(
        `UPDATE providers SET attendance_rules = $2, is_verified = $3,
            public_photo = $4, public_photo_mime = $5, public_photo_id = $6,
            travel_gap_minutes = $7, manual_fit = $8
         WHERE id = $1`,
        [
            demoProviderId,
            originalRules,
            originalVerified,
            originalPhoto.public_photo,
            originalPhoto.public_photo_mime,
            originalPhoto.public_photo_id,
            originalRoutine.travel_gap_minutes,
            originalRoutine.manual_fit,
        ],
    )
    await pool.query('DELETE FROM provider_weekdays WHERE provider_id = $1', [demoProviderId])
    for (const row of originalDays) {
        await pool.query(
            `INSERT INTO provider_weekdays(provider_id, weekday, start_minute, end_minute, break_start_minute, break_end_minute)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [demoProviderId, row.weekday, row.start_minute, row.end_minute, row.break_start_minute, row.break_end_minute],
        )
    }
    await pool.query('DELETE FROM provider_gallery_photos WHERE provider_id = $1', [demoProviderId])
    await pool.query('UPDATE provider_services SET price_large = $2 WHERE id = $1', [banhoId, originalLarge])
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails])
    await pool.query('DELETE FROM professional_types WHERE id = ANY($1::uuid[])', [typeIds])
    await pool.end()
})

describe('public profile editor', { concurrency: 1 }, () => {

test('tutor cannot edit the public profile and verification stays read-only', async () => {
    assert.equal((await request('/providers/me/description', 'PUT', { attendance_rules: 'Tutor' }, tutor)).status, 403)
    assert.equal((await request('/providers/me/photo', 'PUT', pngFile, tutor)).status, 403)
    assert.equal((await request('/providers/me/gallery', 'POST', pngFile, tutor)).status, 403)
    assert.equal((await request('/providers/me/photo', 'DELETE', undefined, tutor)).status, 403)

    const tooLong = await request('/providers/me/description', 'PUT', { attendance_rules: 'a'.repeat(1001) }, groomer)
    assert.equal(tooLong.status, 400)
    const forged = await request('/providers/me/description', 'PUT', { attendance_rules: 'Texto', is_verified: false }, groomer)
    assert.equal(forged.status, 400)
    const stored = await pool.query('SELECT is_verified, attendance_rules FROM providers WHERE id = $1', [demoProviderId])
    assert.equal(stored.rows[0].is_verified, originalVerified)
    assert.equal(stored.rows[0].attendance_rules, originalRules)
})

test('blank description is stored as null and the public area omits the private address fields', async () => {
    const cleared = await request('/providers/me/description', 'PUT', { attendance_rules: '   ' }, groomer)
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body))
    assert.equal(cleared.body.data.attendance_rules, null)
    const profile = await request(`/providers/${banhoId}/profile`, 'GET', undefined, tutor)
    assert.equal(profile.status, 200)
    assert.equal(profile.body.data.attendance_rules, null)
    const location = await pool.query(
        'SELECT base_address, radius_km, base_complement, base_latitude FROM providers WHERE id = $1',
        [demoProviderId],
    )
    assert.deepEqual(profile.body.data.area, {
        radius_km: Number(location.rows[0].radius_km),
        address: location.rows[0].base_address,
    })
    assert.equal(profile.body.data.area.complement, undefined)
    assert.equal(profile.body.data.base_latitude, undefined)
    assert.equal(profile.body.data.base_complement, undefined)
    assert.equal(location.rows[0].base_complement === undefined, false)
    assert.equal(profile.body.data.is_verified, true)
})

test('enabled weekdays are public and the listed price stays the stored minimum', async () => {
    const saved = await request('/providers/weekly-availability', 'PUT', {
        days: {
            mon: day(false),
            tue: day(true, '09:00', '12:00'),
            wed: day(false),
            thu: day(false),
            fri: day(false),
            sat: day(false),
            sun: day(false),
        },
        travel_gap_minutes: 30,
        manual_fit: false,
    }, groomer)
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    await pool.query('UPDATE provider_services SET price_large = 999 WHERE id = $1', [banhoId])
    const profile = await request(`/providers/${banhoId}/profile`, 'GET', undefined, tutor)
    assert.deepEqual(profile.body.data.schedule, [{ weekday: 1, start: '09:00', end: '12:00' }])
    const banho = profile.body.data.services.find(service => service.id === banhoId)
    assert.equal(banho.price, 80)
})

test('a provider without active services reads an empty gallery and hides images from others', async () => {
    const own = await request('/providers/me/public-profile', 'GET', undefined, owner.token)
    assert.equal(own.status, 200, JSON.stringify(own.body))
    assert.equal(own.body.data.is_verified, false)
    assert.deepEqual(own.body.data.services, [])
    assert.deepEqual(own.body.data.gallery, [])
    assert.equal(own.body.data.photo_id, null)

    const photo = await request('/providers/me/photo', 'PUT', pngFile, owner.token)
    assert.equal(photo.status, 200, JSON.stringify(photo.body))
    assert.equal(typeof photo.body.data.photo_id, 'string')
    const picture = await pool.query(
        'SELECT users.profile_picture FROM users JOIN providers ON providers.user_id = users.id WHERE providers.id = $1',
        [owner.providerId],
    )
    assert.equal(picture.rows[0].profile_picture, null)
    const ownerBytes = await bytes(`/providers/public-photo/${owner.providerId}`, owner.token)
    assert.equal(ownerBytes.status, 200)
    assert.equal(ownerBytes.type, 'image/png')
    assert.ok(ownerBytes.body.subarray(0, 8).equals(png.subarray(0, 8)))
    assert.equal((await bytes(`/providers/public-photo/${owner.providerId}`, tutor)).status, 404)
    assert.equal((await bytes(`/providers/public-photo/${owner.providerId}`, other.token)).status, 404)

    const added = []
    for (let index = 0; index < 5; index += 1) {
        const created = await request('/providers/me/gallery', 'POST', pngFile, owner.token)
        assert.equal(created.status, 201, JSON.stringify(created.body))
        added.push(created.body.data.id)
    }
    const sixth = await request('/providers/me/gallery', 'POST', pngFile, owner.token)
    assert.equal(sixth.status, 400)
    const pdf = await request('/providers/me/gallery', 'POST', {
        name: 'documento.pdf', mime_type: 'application/pdf', size: 5, base64: Buffer.from('%PDF-').toString('base64'),
    }, owner.token)
    assert.equal(pdf.status, 400)
    const mismatch = await request('/providers/me/gallery', 'POST', {
        ...pngFile, name: 'foto.jpg', mime_type: 'image/jpeg',
    }, owner.token)
    assert.equal(mismatch.status, 400)

    const listed = await request('/providers/me/public-profile', 'GET', undefined, owner.token)
    assert.deepEqual(listed.body.data.gallery.map(item => item.id), added)
    const visible = await bytes(`/providers/gallery/${added[0]}`, owner.token)
    assert.equal(visible.status, 200)
    assert.equal((await bytes(`/providers/gallery/${added[0]}`, tutor)).status, 404)
    assert.equal((await request(`/providers/me/gallery/${added[0]}`, 'DELETE', undefined, other.token)).status, 404)
    assert.equal((await request(`/providers/me/gallery/${added[0]}`, 'DELETE', undefined, owner.token)).status, 204)
    assert.equal((await bytes(`/providers/gallery/${added[0]}`, owner.token)).status, 404)

    const published = await request('/providers/me/gallery', 'POST', pngFile, groomer)
    assert.equal(published.status, 201, JSON.stringify(published.body))
    const publicPhoto = await bytes(`/providers/gallery/${published.body.data.id}`, tutor)
    assert.equal(publicPhoto.status, 200)
    assert.equal((await request(`/providers/me/gallery/${published.body.data.id}`, 'DELETE', undefined, groomer)).status, 204)
    assert.equal((await bytes(`/providers/gallery/${published.body.data.id}`, tutor)).status, 404)
})

})
