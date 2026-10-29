require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { Pool } = require('pg')
const { io } = require('socket.io-client')
const base = 'http://127.0.0.1:3000/api/v1'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const pool = new Pool({ connectionString:process.env.DATABASE_URL })
const created = { users:[], bookings:[], messages:[], offers:[] }
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
    const signup=await request('/auth/register','POST',{name:'Integration test only',email,password,role:'customer'})
    assert.equal(signup.status,201)
    const user=await pool.query('SELECT id FROM users WHERE email=$1',[email])
    created.users.push(user.rows[0].id)
    assert.equal(signup.body.requires_verification,false)
    outsider=await login(email)
})

after(async () => {
    if(created.messages.length) await pool.query('DELETE FROM messages WHERE id=ANY($1::uuid[])',[created.messages])
    if(created.bookings.length) await pool.query('DELETE FROM bookings WHERE id=ANY($1::uuid[])',[created.bookings])
    if(created.offers.length) await pool.query('DELETE FROM provider_services WHERE id=ANY($1::uuid[])',[created.offers])
    if(created.users.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[created.users])
    await pool.end()
})

test('schema is migrated and demonstration screens have data',async()=>{
    const migrations=await pool.query('SELECT name FROM schema_migrations ORDER BY name')
    assert.equal(migrations.rowCount,3)
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

test('registration and private resources reject unauthorized access',async()=>{
    assert.equal((await request('/auth/register','POST',{name:'Forbidden',email:'forbidden@example.test',password,role:'admin'})).status,400)
    assert.equal((await request('/auth/login','POST',{email:'tutor@mygroomer.test',password:'wrong'})).status,401)
    assert.equal((await request('/bookings/'+id(21),'GET',undefined,outsider)).status,403)
    assert.equal((await request('/providers/'+id(10),'DELETE',undefined,outsider)).status,403)
    assert.equal((await request('/providers/'+id(10),'PATCH',{price:-100},groomer)).status,400)
    assert.equal((await request('/providers/'+id(10),'PATCH',{price:100,provider_id:id(1)},groomer)).status,400)
    assert.equal((await request('/conversations','POST',{booking_id:id(20),provider_id:id(2)},outsider)).status,403)
})

test('local booking can be confirmed and cancelled without any payment',async()=>{
    const scheduledAt=new Date(Date.now()+86400000*7).toISOString()
    const result=await request('/bookings','POST',{provider_service_id:id(10),scheduled_at:scheduledAt,customer_location:'Integration test address'},tutor)
    assert.equal(result.status,201)
    const booking=result.body.data.booking
    created.bookings.push(booking.id)
    assert.equal(booking.scheduled_at, scheduledAt, 'Scheduled instant must round-trip without a timezone shift')
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
