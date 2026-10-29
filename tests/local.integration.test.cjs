require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { Pool } = require('pg')
const { io } = require('socket.io-client')
const base = 'http://127.0.0.1:3000/api/v1'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const pool = new Pool({ connectionString:process.env.DATABASE_URL })
const created = { users:[], bookings:[], messages:[], offers:[], pets:[] }
const password = 'LocalTest#2026'
let tutor, groomer, outsider

const request = async (route, method='GET', body, token) => {
    const response = await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)})
    return { status:response.status, body:await response.json() }
}
const login = async email => {
    const result = await request('/auth/login','POST',{email,password})
    assert.equal(result.status,200)
    return result.body.token
}
const connect = token => new Promise((resolve,reject) => {
    const socket=io('http://127.0.0.1:3000',{auth:{token},transports:['websocket'],reconnection:false,timeout:5000})
    socket.once('connect',()=>resolve(socket))
    socket.once('connect_error',error=>{socket.disconnect();reject(error)})
})
const emit = (socket,event,data) => new Promise((resolve,reject) => socket.timeout(5000).emit(event,data,(error,result)=>error?reject(error):resolve(result)))

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE,'true','Test requires the explicitly configured local environment')
    const url=new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname) && url.pathname==='/mygroomer_dev','Refusing nonlocal database')
    const runtime=await request('/runtime')
    assert.deepEqual(runtime.body.data,{localTest:true,googleAuthEnabled:false,paymentsEnabled:false})
    tutor=await login('tutor@mygroomer.test')
    groomer=await login('groomer@mygroomer.test')
    const email=`integration-${crypto.randomUUID()}@mygroomer.test`
    const signup=await request('/auth/register','POST',{name:'Integration test only',email,password,role:'customer',phone_number:'+5511987654321',accepted_terms:true})
    assert.equal(signup.status,201)
    const user=await pool.query('SELECT id FROM users WHERE email=$1',[email])
    created.users.push(user.rows[0].id)
    assert.equal(signup.body.requires_verification,false)
    outsider=await login(email)
})

after(async () => {
    if(created.messages.length) await pool.query('DELETE FROM messages WHERE id=ANY($1::uuid[])',[created.messages])
    if(created.bookings.length) await pool.query('DELETE FROM bookings WHERE id=ANY($1::uuid[])',[created.bookings])
    if(created.pets.length) await pool.query('DELETE FROM pets WHERE id=ANY($1::uuid[])',[created.pets])
    if(created.offers.length) await pool.query('DELETE FROM provider_services WHERE id=ANY($1::uuid[])',[created.offers])
    if(created.users.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[created.users])
    await pool.end()
})

test('schema is migrated and demonstration screens have data',async()=>{
    const migrations=await pool.query('SELECT name FROM schema_migrations ORDER BY name')
    assert.equal(migrations.rowCount,6)
    for(const [route,token] of [['/categories',tutor],['/bookings',tutor],['/bookings?as=provider',groomer],['/conversations',tutor],['/providers',groomer]]) {
        const result=await request(route,'GET',undefined,token)
        assert.equal(result.status,200,route)
        assert.ok(result.body.data.length>0,route)
    }
    const earnings=await request('/providers/earnings','GET',undefined,groomer)
    assert.equal(earnings.status,200)
    assert.ok(earnings.body.data.totalEarned>0)
})

test('Google and payment HTTP endpoints are disabled',async()=>{
    assert.equal((await request('/auth/google')).status,503)
    assert.equal((await request('/payments/initialize','POST',{booking_id:id(20)},tutor)).status,503)
    assert.equal((await request('/payments/webhook','POST',{event:'charge.success'})).status,503)
})

test('tutor registration stores consent and local mode can reset the password',async()=>{
    const email=`tutor-access-${crypto.randomUUID()}@mygroomer.test`
    const rejected=await request('/auth/register','POST',{name:'Sem aceite',email,password,role:'customer',phone_number:'+5511912345678'})
    assert.equal(rejected.status,400)
    assert.ok(rejected.body.errors.some(issue=>issue.field==='accepted_terms'))
    const signup=await request('/auth/register','POST',{name:'Tutor acesso',email,password,role:'customer',phone_number:'+5511912345678',accepted_terms:true})
    assert.equal(signup.status,201)
    const stored=await pool.query('SELECT id, phone_number, terms_accepted_at FROM users WHERE email=$1',[email])
    created.users.push(stored.rows[0].id)
    assert.equal(stored.rows[0].phone_number,'+5511912345678')
    assert.ok(stored.rows[0].terms_accepted_at)
    assert.equal((await request('/auth/login','POST',{email,password})).status,200)
    const forgot=await request('/auth/forgot-password','POST',{email})
    assert.equal(forgot.status,200)
    assert.equal(typeof forgot.body.reset_token,'string')
    const nextPassword='LocalTest#2027'
    assert.equal((await request('/auth/password-reset','POST',{token:forgot.body.reset_token,password:nextPassword})).status,200)
    assert.equal((await request('/auth/login','POST',{email,password:nextPassword})).status,200)
    assert.equal((await request('/auth/login','POST',{email,password})).status,401)
})

test('registration and private resources reject unauthorized access',async()=>{
    assert.equal((await request('/auth/register','POST',{name:'Forbidden',email:'forbidden@example.test',password,role:'admin'})).status,400)
    assert.equal((await request('/auth/login','POST',{email:'tutor@mygroomer.test',password:'wrong'})).status,401)
    assert.equal((await request('/bookings/'+id(21),'GET',undefined,outsider)).status,403)
    assert.equal((await request('/providers/'+id(10),'DELETE',undefined,outsider)).status,403)
    assert.equal((await request('/providers/'+id(10),'PATCH',{price:-100},groomer)).status,400)
    assert.equal((await request('/providers/'+id(10),'PATCH',{price:100,provider_id:id(1)},groomer)).status,400)
    assert.equal((await request('/conversations','POST',{booking_id:id(20),provider_id:id(2)},outsider)).status,403)
})

test('tutor pet is private, optional photo is omitted, and a saved pet is reused',async()=>{
    const tutorUser=await pool.query("SELECT id FROM users WHERE email='tutor@mygroomer.test'")
    const payload={name:'Rex integração',species:'dog',breed:'SRD',size:'medium',age_years:4,notes:'Medo de secador'}
    const invalid=await request('/pets','POST',{name:'',species:'bird',breed:'',size:'huge',age_years:-1,notes:'x'.repeat(501)},tutor)
    assert.equal(invalid.status,400)
    for (const field of ['name','species','breed','size','age_years','notes']) {
        assert.ok(invalid.body.errors.some(issue=>issue.field===field), field)
    }
    assert.equal((await request('/pets')).status,401)
    assert.equal((await request('/pets','GET',undefined,groomer)).status,403)
    assert.equal((await request('/pets','POST',payload,groomer)).status,403)
    const saved=await request('/pets','POST',payload,tutor)
    assert.equal(saved.status,201)
    const pet=saved.body.data
    created.pets.push(pet.id)
    assert.equal(pet.photo_url,null)
    assert.equal(pet.owner_id,tutorUser.rows[0].id)
    assert.equal(pet.species,'dog')
    assert.equal(pet.breed,'SRD')
    assert.equal(pet.size,'medium')
    assert.equal(pet.age_years,4)
    assert.equal(pet.notes,'Medo de secador')
    const stored=await pool.query('SELECT photo_url, owner_id FROM pets WHERE id=$1',[pet.id])
    assert.equal(stored.rows[0].photo_url,null)
    assert.equal(stored.rows[0].owner_id,tutorUser.rows[0].id)
    const ownList=await request('/pets','GET',undefined,tutor)
    assert.equal(ownList.status,200)
    assert.ok(ownList.body.data.some(item=>item.id===pet.id))
    const hidden=await request('/pets','GET',undefined,outsider)
    assert.equal(hidden.status,200)
    assert.equal(hidden.body.data.some(item=>item.id===pet.id),false)
    assert.equal((await request('/pets/'+pet.id,'GET',undefined,outsider)).status,404)
    assert.equal((await request('/pets/'+pet.id,'PATCH',{...payload,notes:'alterado por outro'},outsider)).status,404)
    assert.equal((await pool.query('SELECT notes FROM pets WHERE id=$1',[pet.id])).rows[0].notes,'Medo de secador')
    const updated=await request('/pets/'+pet.id,'PATCH',{...payload,notes:'Tosa na tesoura'},tutor)
    assert.equal(updated.status,200)
    assert.equal(updated.body.data.notes,'Tosa na tesoura')
    assert.equal(updated.body.data.photo_url,null)
    const scheduledAt=new Date(Date.now()+86400000*8).toISOString()
    const bookingBody={pet_id:pet.id,provider_service_id:id(10),scheduled_at:scheduledAt,customer_location:'Integration test address'}
    assert.equal((await request('/bookings','POST',{provider_service_id:id(10),scheduled_at:scheduledAt,customer_location:'Integration test address'},tutor)).status,400)
    assert.equal((await request('/bookings','POST',bookingBody,outsider)).status,404)
    const before=await pool.query('SELECT count(*)::int AS total FROM pets WHERE owner_id=$1',[tutorUser.rows[0].id])
    const first=await request('/bookings','POST',bookingBody,tutor)
    const second=await request('/bookings','POST',{...bookingBody,scheduled_at:new Date(Date.now()+86400000*9).toISOString()},tutor)
    assert.equal(first.status,201)
    assert.equal(second.status,201)
    created.bookings.push(first.body.data.booking.id,second.body.data.booking.id)
    assert.equal(first.body.data.booking.pet_id,pet.id)
    assert.equal(second.body.data.booking.pet_id,pet.id)
    const after=await pool.query('SELECT count(*)::int AS total FROM pets WHERE owner_id=$1',[tutorUser.rows[0].id])
    assert.equal(after.rows[0].total,before.rows[0].total)
    const detail=await request('/bookings/'+first.body.data.booking.id,'GET',undefined,tutor)
    assert.equal(detail.body.data.pet_name,'Rex integração')
    assert.equal(detail.body.data.pet_notes,'Tosa na tesoura')
})

test('local booking can be confirmed and cancelled without any payment',async()=>{
    const pet=await request('/pets','POST',{name:'Pet do agendamento',species:'cat',breed:'SRD',size:'small',age_years:2},tutor)
    assert.equal(pet.status,201)
    created.pets.push(pet.body.data.id)
    const scheduledAt=new Date(Date.now()+86400000*7).toISOString()
    const result=await request('/bookings','POST',{pet_id:pet.body.data.id,provider_service_id:id(10),scheduled_at:scheduledAt,customer_location:'Integration test address'},tutor)
    assert.equal(result.status,201)
    const booking=result.body.data.booking
    created.bookings.push(booking.id)
    assert.equal(booking.pet_id, pet.body.data.id)
    assert.equal(booking.scheduled_at, scheduledAt, 'Scheduled instant must round-trip without a timezone shift')
    assert.equal(result.body.message,'Agendamento de teste criado sem pagamento')
    assert.equal(result.body.data.payment_mode,'disabled')
    assert.equal(result.body.data.authorization_url,null)
    assert.equal(booking.booking_status,'pending_confirmation')
    assert.equal((await request('/bookings/'+booking.id+'/status','PATCH',{booking_status:'confirmed'},groomer)).status,200)
    assert.equal((await request('/bookings/'+booking.id+'/status','PATCH',{booking_status:'cancelled'},tutor)).status,200)
    assert.equal((await pool.query('SELECT id FROM payments WHERE booking_id=$1',[booking.id])).rowCount,0)
})

test('chat persists valid messages and rejects nonparticipants',async()=>{
    const sender=await connect(tutor), attacker=await connect(outsider)
    try {
        const malformed = new Promise(resolve => sender.once('error', resolve))
        sender.emit('send_message', {}, 'invalid-callback')
        await malformed
        assert.equal((await request('/runtime')).status, 200)
        const sent=await emit(sender,'send_message',{conversation_id:id(30),content:'Automated local integration message'})
        assert.equal(sent.success,true)
        created.messages.push(sent.data.id)
        assert.equal(sent.data.is_seen,false)
        const history=await request('/conversations/'+id(30)+'/messages?limit=100','GET',undefined,tutor)
        assert.ok(history.body.data.some(message=>message.id===sent.data.id))
        assert.equal((await emit(attacker,'send_message',{conversation_id:id(30),content:'Unauthorized'})).success,false)
        assert.equal((await emit(attacker,'message_seen',{conversation_id:id(30)})).success,false)
        assert.equal((await pool.query('SELECT is_seen FROM messages WHERE id=$1',[sent.data.id])).rows[0].is_seen,false)
    } finally { sender.disconnect();attacker.disconnect() }
})

test('provider registration rolls back both rows when the provider insert fails', async () => {
    const db = require('../dist/config/database.config')
    await db.connectDB()
    const providerService = require('../dist/modules/provider/provider.service')
    const auth = require('../dist/modules/auth/auth.service')
    const original = providerService.insertProvider
    providerService.insertProvider = async () => { throw new Error('induced provider insert failure') }
    const email = `rollback-provider-${crypto.randomUUID()}@mygroomer.test`
    try {
        await assert.rejects(() => auth.registerUser({
            name: 'Rollback groomer',
            email,
            password,
            role: 'provider',
            payout_method: 'mobile_money',
            momo_number: '+233200000000',
            momo_provider: 'mtn',
            service_area: 'Pinheiros',
            phone_number: '+5511987654321',
            accepted_terms: true,
        }), /induced provider insert failure/)
        assert.equal((await pool.query('SELECT id FROM users WHERE email=$1', [email])).rowCount, 0)
        assert.equal((await pool.query(
            'SELECT providers.id FROM providers JOIN users ON users.id = providers.user_id WHERE users.email=$1',
            [email],
        )).rowCount, 0)
    } finally {
        providerService.insertProvider = original
    }
})

test('provider self-registration rolls back when the role update fails', async () => {
    const db = require('../dist/config/database.config')
    await db.connectDB()
    const email = `provider-role-${crypto.randomUUID()}@mygroomer.test`
    const signup = await request('/auth/register', 'POST', {
        name: 'Tutor que vira groomer', email, password, role: 'customer',
        phone_number: '+5511987654321', accepted_terms: true,
    })
    assert.equal(signup.status, 201)
    const user = (await pool.query('SELECT id, role FROM users WHERE email=$1', [email])).rows[0]
    created.users.push(user.id)
    const token = await login(email)
    const auth = require('../dist/modules/auth/auth.service')
    const { registerAsProvider } = require('../dist/modules/provider/provider.controller')
    const original = auth.assignProviderRole
    auth.assignProviderRole = async () => { throw new Error('induced role update failure') }
    const body = {
        payout_method: 'mobile_money', momo_number: '+233200000000', momo_provider: 'mtn', service_area: 'Pinheiros',
    }
    try {
        await assert.rejects(() => registerAsProvider({ user: { id: user.id, name: 'Tutor que vira groomer', email }, body }, {}), /induced role update failure/)
        assert.equal((await pool.query('SELECT id FROM providers WHERE user_id=$1', [user.id])).rowCount, 0)
        assert.equal((await pool.query('SELECT role FROM users WHERE id=$1', [user.id])).rows[0].role, 'customer')
    } finally {
        auth.assignProviderRole = original
    }
    const registered = await request('/providers/register', 'POST', body, token)
    assert.equal(registered.status, 201)
    assert.equal((await pool.query('SELECT role FROM users WHERE id=$1', [user.id])).rows[0].role, 'provider')
    assert.equal((await pool.query('SELECT id FROM providers WHERE user_id=$1', [user.id])).rowCount, 1)
})

test('charge confirmation rolls back payment and booking together', async () => {
    const db = require('../dist/config/database.config')
    await db.connectDB()
    const bookingId = crypto.randomUUID()
    const reference = `rollback_${bookingId}`
    const { confirmSuccessfulCharge } = require('../dist/modules/payment/confirm-charge.service')
    try {
        await pool.query(
            `INSERT INTO bookings (id, customer_id, provider_service_id, scheduled_at, booking_status, customer_location)
             VALUES ($1,$2,$3,NOW()+INTERVAL '3 days','pending_payment','Rollback test')`,
            [bookingId, id(1), id(10)],
        )
        await pool.query(
            `INSERT INTO payments (customer_id, booking_id, amount, payment_date, payment_status, paystack_reference)
             VALUES ($1,$2,80,NOW(),'pending',$3)`,
            [id(1), bookingId, reference],
        )
        await assert.rejects(
            () => confirmSuccessfulCharge(reference, { afterPaymentUpdate: async () => { throw new Error('induced failure') } }),
            /induced failure/,
        )
        assert.equal((await pool.query('SELECT payment_status FROM payments WHERE paystack_reference=$1', [reference])).rows[0].payment_status, 'pending')
        assert.equal((await pool.query('SELECT booking_status FROM bookings WHERE id=$1', [bookingId])).rows[0].booking_status, 'pending_payment')

        await confirmSuccessfulCharge(reference)
        assert.equal((await pool.query('SELECT payment_status FROM payments WHERE paystack_reference=$1', [reference])).rows[0].payment_status, 'success')
        assert.equal((await pool.query('SELECT booking_status FROM bookings WHERE id=$1', [bookingId])).rows[0].booking_status, 'pending_confirmation')

        await pool.query(`UPDATE bookings SET booking_status='confirmed' WHERE id=$1`, [bookingId])
        await confirmSuccessfulCharge(reference)
        assert.equal((await pool.query('SELECT payment_status FROM payments WHERE paystack_reference=$1', [reference])).rows[0].payment_status, 'success')
        assert.equal((await pool.query('SELECT booking_status FROM bookings WHERE id=$1', [bookingId])).rows[0].booking_status, 'confirmed')

        const { markChargeFailed } = require('../dist/modules/payment/payment.webhook.service')
        const { withTransaction } = require('../dist/shared/db/transaction')
        const { applyPaymentStatus } = require('../dist/modules/payment/payment.service')
        await markChargeFailed(reference)
        assert.equal((await pool.query('SELECT payment_status FROM payments WHERE paystack_reference=$1', [reference])).rows[0].payment_status, 'success')
        await withTransaction(async (client) => {
            const cancelled = await applyPaymentStatus(reference, 'cancelled', client)
            assert.equal(cancelled.rejected, true)
        })
        assert.equal((await pool.query('SELECT payment_status FROM payments WHERE paystack_reference=$1', [reference])).rows[0].payment_status, 'success')

        await pool.query(`UPDATE payments SET payment_status='refunded' WHERE paystack_reference=$1`, [reference])
        await confirmSuccessfulCharge(reference)
        assert.equal((await pool.query('SELECT payment_status FROM payments WHERE paystack_reference=$1', [reference])).rows[0].payment_status, 'refunded')
        assert.equal((await pool.query('SELECT booking_status FROM bookings WHERE id=$1', [bookingId])).rows[0].booking_status, 'confirmed')
    } finally {
        await pool.query('DELETE FROM payments WHERE paystack_reference=$1', [reference])
        await pool.query('DELETE FROM bookings WHERE id=$1', [bookingId])
        await db.getPool().end()
    }
})
