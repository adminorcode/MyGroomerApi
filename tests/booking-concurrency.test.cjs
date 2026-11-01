const { test } = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios').default
const db = require('../dist/config/database.config')
const repo = require('../dist/modules/booking/booking.repo')
const slots = require('../dist/modules/booking/booking-slots.service')
const service = require('../dist/modules/booking/booking.service')

test('booking creation never initializes external payment', async () => {
    const originalMode = process.env.LOCAL_TEST_MODE
    const originalNodeEnv = process.env.NODE_ENV
    const originals = {
        getPool: db.getPool,
        findOffer: require('../dist/modules/provider/provider.service').findProviderServiceById,
        lock: require('../dist/modules/provider/agenda.service').lockProviderAgenda,
        providerUser: repo.findProviderUserId,
        open: repo.findOpenBookingRequest,
        prepare: slots.revalidateBookingSlot,
        insert: repo.insertBooking,
        find: repo.findBookingById,
        post: axios.post,
    }
    let paymentCalled = false
    process.env.LOCAL_TEST_MODE = 'false'
    process.env.NODE_ENV = 'test'
    axios.post = async () => { paymentCalled = true }
    require('../dist/modules/provider/provider.service').findProviderServiceById = async () => ({ id: 'offer', provider_id: 'provider' })
    require('../dist/modules/provider/agenda.service').lockProviderAgenda = async () => {}
    repo.findProviderUserId = async () => 'provider-user'
    repo.findOpenBookingRequest = async () => null
    slots.revalidateBookingSlot = async () => ({ duration_minutes: 30, price: 50, timezone: 'America/Sao_Paulo', slots: [] })
    repo.insertBooking = async id => ({ id, booking_status: 'pending_confirmation' })
    repo.findBookingById = async id => ({ id, booking_status: 'pending_confirmation', price: 50, service_price: 50 })
    db.getPool = () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        connect: async () => ({
            query: async sql => {
                if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
                return { rows: [], rowCount: 0 }
            },
            release: () => {},
        }),
    })
    try {
        const result = await service.createBookingForCustomer({ id: 'tutor', role: 'customer', email: 'fixture@example.test' }, {
            pet_id: 'pet', provider_service_id: 'offer', scheduled_at: '2030-01-01T12:00:00.000Z', customer_location: 'Teste',
        })
        assert.equal(result.created, true)
        assert.equal(paymentCalled, false)
    } finally {
        db.getPool = originals.getPool
        require('../dist/modules/provider/provider.service').findProviderServiceById = originals.findOffer
        require('../dist/modules/provider/agenda.service').lockProviderAgenda = originals.lock
        repo.findProviderUserId = originals.providerUser
        repo.findOpenBookingRequest = originals.open
        slots.revalidateBookingSlot = originals.prepare
        repo.insertBooking = originals.insert
        repo.findBookingById = originals.find
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
