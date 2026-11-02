const { test } = require('node:test')
const assert = require('node:assert/strict')
const db = require('../dist/config/database.config')
const repo = require('../dist/modules/booking/booking.repo')
const service = require('../dist/modules/booking/booking.service')

const statementOf = query => typeof query === 'string' ? query : query.text
const valuesOf = (query, params) => params ?? query.values ?? []

test('a provider can mark a confirmed booking as en route and a tutor cannot', async () => {
    const originalMode = process.env.LOCAL_TEST_MODE
    const originalNodeEnv = process.env.NODE_ENV
    const originals = { getPool: db.getPool, find: repo.findBookingById, participant: repo.isBookingProvider }
    let status = 'confirmed'
    process.env.LOCAL_TEST_MODE = 'true'
    process.env.NODE_ENV = 'test'
    repo.findBookingById = async () => ({ id: 'booking', customer_id: 'tutor', booking_status: status })
    repo.isBookingProvider = async (_bookingId, userId) => userId === 'provider'
    db.getPool = () => ({
        query: async (sql, params) => {
            const text = statementOf(sql)
            const values = valuesOf(sql, params)
            assert.match(text, /UPDATE/)
            assert.ok(values.includes('en_route') || text.includes('en_route'), text)
            status = 'en_route'
            return { rows: [{ id: 'booking', customer_id: 'tutor', booking_status: 'en_route' }], rowCount: 1 }
        },
    })
    try {
        await assert.rejects(
            () => service.changeBookingStatusForActor({ id: 'tutor', role: 'customer' }, 'booking', 'en_route'),
            error => error.statusCode === 403,
        )
        assert.equal(status, 'confirmed')
        const updated = await service.changeBookingStatusForActor({ id: 'provider', role: 'provider' }, 'booking', 'en_route')
        assert.equal(updated.booking_status, 'en_route')
        await assert.rejects(
            () => service.changeBookingStatusForActor({ id: 'provider', role: 'provider' }, 'booking', 'en_route'),
            error => error.statusCode === 400 && /em deslocamento/.test(error.message),
        )
    } finally {
        db.getPool = originals.getPool
        repo.findBookingById = originals.find
        repo.isBookingProvider = originals.participant
        if (originalMode === undefined) delete process.env.LOCAL_TEST_MODE
        else process.env.LOCAL_TEST_MODE = originalMode
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = originalNodeEnv
    }
})

test('en route is not a valid jump from a pending request', async () => {
    const originals = { find: repo.findBookingById, participant: repo.isBookingProvider }
    repo.findBookingById = async () => ({ id: 'booking', customer_id: 'tutor', booking_status: 'pending_confirmation' })
    repo.isBookingProvider = async () => true
    try {
        await assert.rejects(
            () => service.changeBookingStatusForActor({ id: 'provider', role: 'provider' }, 'booking', 'en_route'),
            error => error.statusCode === 400 && /aguardando confirmação/.test(error.message),
        )
    } finally {
        repo.findBookingById = originals.find
        repo.isBookingProvider = originals.participant
    }
})
