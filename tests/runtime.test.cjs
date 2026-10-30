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
    const payments = require('../dist/integrations/payments/paystack-payment.gateway').paystackPaymentGateway
    const payouts = require('../dist/integrations/payouts/paystack-payout.gateway')
    for (const operation of [
        () => payments.initializePayment({ email: 'demo@example.test', amountMinor: 100, reference: 'local' }),
        () => payments.verifyPayment('local'),
        () => payments.refundPayment('local', 100),
        () => payouts.createPaystackTransferRecipient({}),
        () => payouts.initiatePaystackTransfer({}),
        () => require('../dist/modules/payout/payout.worker').startPayoutWorker(),
    ]) await assert.rejects(operation, /Payments are disabled/)
    assert.throws(() => require('../dist/modules/payout/payout.job').startPayoutCronJob(), /Payments are disabled/)
})

test('local email does not require provider credentials', async () => {
    delete process.env.RESEND_API_KEY
    const result = await require('../dist/integrations/email/email').sendEmail('demo@example.test', { subject:'Test', html:'Test' })
    assert.equal(result.id, 'local-test-email-not-sent')
})

test('public registration cannot request admin', () => {
    const { registerAuthSchema } = require('../dist/modules/auth/auth.schemas')
    assert.equal(registerAuthSchema.safeParse({name:'Test',email:'admin@example.test',password:'LocalTest#2026',role:'admin'}).success, false)
})

test('tutor registration requires a valid phone and explicit consent', () => {
    const { registerAuthSchema } = require('../dist/modules/auth/auth.schemas')
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

test('local payment gateway is the fake and does not call Paystack', async () => {
    process.env.NODE_ENV = 'test'
    process.env.LOCAL_TEST_MODE = 'true'
    const { getPaymentGateway } = require('../dist/integrations/payments/payment-gateway')
    const gateway = getPaymentGateway()
    const initialized = await gateway.initializePayment({
        email: 'tutor@email.com',
        amountMinor: 0,
        reference: 'local-booking',
    })
    assert.equal(initialized.mode, 'disabled')
    assert.equal(initialized.authorizationUrl, null)
    await assert.rejects(() => gateway.verifyPayment('local'), /Payments are disabled/)
    await assert.rejects(() => gateway.refundPayment('local', 100), /Payments are disabled/)
    await assert.rejects(() => gateway.parseWebhook(Buffer.from('{}'), 'sig'), /Payments are disabled/)
})

test('paystack webhook rejects a signed success event that has no reference', async () => {
    process.env.PAYSTACK_SECRET_KEY = 'test-secret'
    const { createHmac } = require('crypto')
    const { paystackPaymentGateway } = require('../dist/integrations/payments/paystack-payment.gateway')
    const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: {} }))
    const signature = createHmac('sha512', 'test-secret').update(body).digest('hex')
    await assert.rejects(() => paystackPaymentGateway.parseWebhook(body, signature), /Payment verification failed/)
    await assert.rejects(() => paystackPaymentGateway.parseWebhook(body, 'not-the-signature'), /Invalid signature/)
})

test('migrated modules keep payment boundaries and shared errors', () => {
    const fs = require('fs')
    const path = require('path')
    const src = path.join(__dirname, '../src')
    const errors = fs.readFileSync(path.join(src, 'shared/errors.ts'), 'utf8')
    assert.match(errors, /export class AppError/)
    assert.equal(fs.existsSync(path.join(src, 'middlewares')), false)
    for (const gone of ['controllers', 'services', 'validators', 'jobs', 'workers', 'queues']) {
        assert.equal(fs.existsSync(path.join(src, gone)), false, gone)
    }
    assert.deepEqual(fs.readdirSync(path.join(src, 'routes')), ['index.ts'])
    for (const vendor of ['paystack.utils.ts', 'email.utils.ts', 'cache.utils.ts', 'jwt.utils.ts', 'token.utils.ts', 'regex.utils.ts']) {
        assert.equal(fs.existsSync(path.join(src, 'utils', vendor)), false, vendor)
    }
    const files = []
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (entry.name.endsWith('.ts')) files.push(full)
        }
    }
    walk(path.join(src, 'modules'))
    const repoImport = /from ['"][^'"]*\/([a-z-]+)\.repo['"]/
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8')
        const moduleName = path.basename(path.dirname(file))
        assert.equal(source.includes('paystack.utils'), false, file)
        assert.equal(source.includes('api.paystack.co'), false, file)
        assert.equal(source.includes('resend'), false, file)
        const importedRepo = source.match(repoImport)
        if (importedRepo) assert.equal(importedRepo[1], moduleName, file)
    }
    const bookingService = fs.readFileSync(path.join(src, 'modules/booking/booking.service.ts'), 'utf8')
    assert.equal(bookingService.includes('withTransaction'), true)
    assert.equal(bookingService.includes('pet.service'), true)
    assert.equal(bookingService.includes('provider.service'), true)
})

test('offer updates reject nonpositive prices and ownership changes', () => {
    const { updateProviderServiceSchema } = require('../dist/modules/provider/provider.schemas')
    assert.equal(updateProviderServiceSchema.safeParse({price:-1}).success, false)
    assert.equal(updateProviderServiceSchema.safeParse({price:1,provider_id:'another-provider'}).success, false)
    assert.equal(updateProviderServiceSchema.safeParse({price:85}).success, true)
})
