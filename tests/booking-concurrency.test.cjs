const { test } = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios').default
const db = require('../dist/config/database.config')
const repo = require('../dist/modules/booking/booking.repo')
const slots = require('../dist/modules/booking/booking-slots.service')
const service = require('../dist/modules/booking/booking.service')

test('payment initialization has bounded transport and its timeout rolls back the agenda transaction', async () => {
    const originalMode = process.env.LOCAL_TEST_MODE
    const originalNodeEnv = process.env.NODE_ENV
    const originals = { getPool: db.getPool, prepare: slots.revalidateBookingSlot, post: axios.post }
    const commands = []
    let released = false
    let held = false
    const timedOut = new axios.AxiosError('Payment initialization timed out', 'ECONNABORTED')
    process.env.LOCAL_TEST_MODE = 'false'
    process.env.NODE_ENV = 'test'
    const client = {
        query: async query => {
            commands.push(query)
            if (query.includes('FOR UPDATE')) held = true
            if (query === 'ROLLBACK') held = false
            return { rows: [], rowCount: 0 }
        },
        release: () => { released = true },
    }
    db.getPool = () => ({ connect: async () => client })
    slots.revalidateBookingSlot = async (owner, input, connection) => {
        await connection.query('SELECT id FROM providers WHERE id = $1 FOR UPDATE')
        return { slots: [input.scheduled_at], duration_minutes: 30, price: 50, timezone: 'America/Sao_Paulo' }
    }
    axios.post = async (url, body, options) => {
        assert.equal(url, 'https://api.paystack.co/transaction/initialize')
        assert.equal(options.timeout, 10_000)
        assert.ok(options.signal instanceof AbortSignal)
        assert.equal(options.signal.aborted, false)
        assert.equal(held, true, 'initialization is inside the agenda transaction')
        throw timedOut
    }
    try {
        await assert.rejects(() => service.createBookingForCustomer({ id: 'tutor', role: 'customer', email: 'fixture@example.test' }, {
            pet_id: 'pet', provider_service_id: 'offer', scheduled_at: '2030-01-01T12:00:00.000Z', customer_location: 'Teste',
        }), error => error === timedOut)
        assert.deepEqual(commands, ['BEGIN', 'SELECT id FROM providers WHERE id = $1 FOR UPDATE', 'ROLLBACK'])
        assert.equal(released, true)
        assert.equal(held, false)
        assert.equal(commands.some(query => query.includes('INSERT')), false)
    } finally {
        db.getPool = originals.getPool
        slots.revalidateBookingSlot = originals.prepare
        axios.post = originals.post
        if (originalMode === undefined) delete process.env.LOCAL_TEST_MODE
        else process.env.LOCAL_TEST_MODE = originalMode
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = originalNodeEnv
    }
})

test('a confirmation read before cancellation cannot overwrite the cancelled state', async () => {
    const originalMode = process.env.LOCAL_TEST_MODE
    const originalNodeEnv = process.env.NODE_ENV
    const originals = { getPool: db.getPool, find: repo.findBookingById, participant: repo.isBookingProvider }
    let status = 'pending_confirmation'
    let releaseConfirmation
    let notifyRead
    const paused = new Promise(resolve => { releaseConfirmation = resolve })
    const read = new Promise(resolve => { notifyRead = resolve })
    const updates = []
    process.env.LOCAL_TEST_MODE = 'true'
    process.env.NODE_ENV = 'test'
    repo.findBookingById = async () => ({ id: 'booking', customer_id: 'tutor', booking_status: status })
    repo.isBookingProvider = async (bookingId, userId) => {
        if (userId === 'provider') {
            notifyRead()
            await paused
            return true
        }
        return false
    }
    db.getPool = () => ({
        query: async (sql, params) => {
            assert.match(sql, /AND booking_status = \$4/)
            updates.push([...params])
            if (params[3] !== status) return { rows: [], rowCount: 0 }
            status = params[0]
            return { rows: [{ id: 'booking', booking_status: status }], rowCount: 1 }
        },
    })
    try {
        const confirming = service.changeBookingStatusForActor({ id: 'provider', role: 'provider' }, 'booking', 'confirmed')
        await read
        const cancelled = await service.changeBookingStatusForActor({ id: 'tutor', role: 'customer' }, 'booking', 'cancelled')
        assert.equal(cancelled.booking_status, 'cancelled')
        releaseConfirmation()
        await assert.rejects(() => confirming, error => error.statusCode === 409)
        assert.equal(status, 'cancelled')
        assert.deepEqual(updates.map(params => [params[0], params[3]]), [
            ['cancelled', 'pending_confirmation'], ['confirmed', 'pending_confirmation'],
        ])
    } finally {
        releaseConfirmation()
        db.getPool = originals.getPool
        repo.findBookingById = originals.find
        repo.isBookingProvider = originals.participant
        if (originalMode === undefined) delete process.env.LOCAL_TEST_MODE
        else process.env.LOCAL_TEST_MODE = originalMode
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = originalNodeEnv
    }
})
