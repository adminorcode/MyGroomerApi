const { test } = require('node:test')
const assert = require('node:assert/strict')
process.env.NODE_ENV = 'test'
process.env.LOCAL_TEST_MODE = 'true'
const runtime = require('../dist/config/runtime.config')

test('migration checksums tolerate checkout line endings but reject SQL changes', () => {
    const { migrationChecksums } = require('../dist/scripts/migration-checksum')
    const lf = migrationChecksums('SELECT 1;\nSELECT 2;\n')
    const crlf = migrationChecksums('SELECT 1;\r\nSELECT 2;\r\n')
    assert.equal(lf.checksum, crlf.checksum)
    assert.ok(lf.compatible.has(crlf.checksum))
    assert.ok(!lf.compatible.has(migrationChecksums('SELECT 3;\n').checksum))
})

test('local mode cannot run in production', () => {
    process.env.NODE_ENV = 'production'
    assert.throws(() => runtime.isLocalTestMode(), /requires NODE_ENV/)
    process.env.NODE_ENV = 'test'
    assert.equal(runtime.isLocalTestMode(), true)
    assert.equal(runtime.isGoogleAuthEnabled(), false)
})

test('demo seed refuses nonlocal hosts and other databases', () => {
    const original = process.env.DATABASE_URL
    for (const url of ['postgresql://localhost/production', 'postgresql://external.example/mygroomer_dev']) {
        process.env.DATABASE_URL = url
        assert.throws(() => runtime.assertLocalTestDatabase(), /restricted/)
    }
    process.env.DATABASE_URL = 'postgresql://127.0.0.1:5433/mygroomer_dev'
    assert.doesNotThrow(() => runtime.assertLocalTestDatabase())
    process.env.DATABASE_URL = original
})

test('all gateway entry points reject local mode before HTTP calls', async () => {
    const gateway = require('../dist/utils/paystack.utils')
    for (const operation of [
        () => gateway.initializePaystackPayment('demo@example.test', 100, 'local'),
        () => gateway.verifyPaystackPayment('local'),
        () => gateway.refundPaystackPayment('local', 100),
        () => gateway.createPaystackTransferRecipient({}),
        () => gateway.initiatePaystackTransfer({}),
        () => require('../dist/workers/payout.worker').startPayoutWorker()
    ]) await assert.rejects(operation, /Payments are disabled/)
    assert.throws(() => require('../dist/jobs/payout.job').startPayoutCronJob(), /Payments are disabled/)
})

test('local email does not require provider credentials', async () => {
    delete process.env.RESEND_API_KEY
    const result = await require('../dist/utils/email.utils').sendEmail('demo@example.test', { subject:'Test', html:'Test' })
    assert.equal(result.id, 'local-test-email-not-sent')
})

test('public registration cannot request admin', () => {
    const { registerAuthSchema } = require('../dist/validators/auth.validator')
    assert.equal(registerAuthSchema.safeParse({name:'Test',email:'admin@example.test',password:'LocalTest#2026',role:'admin'}).success, false)
})

test('tutor registration requires a valid phone and explicit consent', () => {
    const { registerAuthSchema } = require('../dist/validators/auth.validator')
    const password = 'LocalTest#2026'
    const base = { name:'Tutor', email:'tutor-new@example.test', password, role:'customer' }
    assert.equal(registerAuthSchema.safeParse(base).success, false)
    assert.equal(registerAuthSchema.safeParse({ ...base, phone_number:'+5511987654321' }).success, false)
    assert.equal(registerAuthSchema.safeParse({ ...base, phone_number:'11987654321', accepted_terms:true }).success, false)
    assert.equal(registerAuthSchema.safeParse({ ...base, phone_number:'+5511987654321', accepted_terms:false }).success, false)
    assert.equal(registerAuthSchema.safeParse({ ...base, phone_number:'+5511987654321', accepted_terms:true }).success, true)
    assert.equal(registerAuthSchema.safeParse({
        name:'Groomer', email:'groomer-new@example.test', password, role:'provider',
        payout_method:'mobile_money', momo_number:'+233200000000', momo_provider:'mtn', service_area:'Pinheiros'
    }).success, true)
})

test('offer updates reject nonpositive prices and ownership changes', () => {
    const { updateProviderServiceSchema } = require('../dist/validators/provider.validator')
    assert.equal(updateProviderServiceSchema.safeParse({price:-1}).success, false)
    assert.equal(updateProviderServiceSchema.safeParse({price:1,provider_id:'another-provider'}).success, false)
    assert.equal(updateProviderServiceSchema.safeParse({price:85}).success, true)
})
