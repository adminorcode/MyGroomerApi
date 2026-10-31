require('dotenv').config({ quiet:true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { Pool } = require('pg')
const pool = new Pool({ connectionString:process.env.DATABASE_URL })
const base = 'http://127.0.0.1:3000/api/v1'
const password = 'Registration#2026'
const createdEmails = []
const typeIds = [crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()]
let account, other, tutor
const evidence = Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF')
const file = {name:'certificado.pdf',mime_type:'application/pdf',size:evidence.length,base64:evidence.toString('base64')}
const request = async (route, method='GET', body, token) => {
    const response = await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
    return {status:response.status,body:await response.json()}
}
const details = overrides => ({document:'52998224725',experience:'Experiência com atendimento domiciliar.',certifications:'Curso de banho e tosa.',professional_type_ids:typeIds.slice(0,2),attachments:[],...overrides})
const signup = async (overrides={}) => {
    const email = `registration-${crypto.randomUUID()}@mygroomer.test`
    createdEmails.push(email)
    const payload = {name:'Maria de Teste',email,password,role:'provider',phone_number:'+5511987654321',registration:details(),...overrides}
    const result = await request('/auth/register','POST',payload)
    return {...result,email,payload}
}
const login = async (email,secret=password) => {
    const result = await request('/auth/login','POST',{email,password:secret})
    assert.equal(result.status,200,JSON.stringify(result.body))
    return result.body.token
}
const form = overrides => ({name:'Maria de Teste',email:account.email,phone_number:'+5511987654321',...details(),mode:'continue',...overrides})

before(async()=>{
    assert.equal(process.env.LOCAL_TEST_MODE,'true')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.pathname==='/mygroomer_dev','Refusing nonlocal DB')
    await pool.query(`INSERT INTO professional_types(id,name,is_active) VALUES ($1,$4,true),($2,$5,true),($3,$6,false)`,[...typeIds,...typeIds.map((id,index)=>`Registration type ${index} ${id}`)])
    account = await signup({registration:details({attachments:[file]})})
    assert.equal(account.status,201,JSON.stringify(account.body))
    account.token = await login(account.email)
    account.providerId = (await pool.query('SELECT p.id FROM providers p JOIN users u ON p.user_id=u.id WHERE u.email=$1',[account.email])).rows[0].id
    other = await signup()
    assert.equal(other.status,201,JSON.stringify(other.body))
    other.token = await login(other.email)
    tutor = await login('tutor@email.com','admin')
})

after(async()=>{
    await pool.query('DELETE FROM users WHERE email=ANY($1::text[])',[createdEmails])
    await pool.query('DELETE FROM professional_types WHERE id=ANY($1::uuid[])',[typeIds])
    await pool.end()
})

test('public catalog contains only active id/name, authenticated catalog remains protected',async()=>{
    const result = await request('/professional-types/public?include_inactive=true')
    assert.equal(result.status,200)
    assert.ok(typeIds.slice(0,2).every(id=>result.body.data.some(type=>type.id===id)))
    assert.ok(!result.body.data.some(type=>type.id===typeIds[2]))
    assert.ok(result.body.data.every(type=>Object.keys(type).sort().join(',')==='id,name'))
    assert.equal((await request('/professional-types')).status,401)
})

test('only authenticated professionals read/write their own registration',async()=>{
    assert.equal((await request('/providers/registration')).status,401)
    assert.equal((await request('/providers/registration','GET',undefined,tutor)).status,403)
    assert.equal((await request('/providers/registration','PUT',form(),tutor)).status,403)
    const result = await request('/providers/registration','GET',undefined,account.token)
    assert.equal(result.status,200)
    assert.equal(result.body.data.email,account.email)
    assert.equal(result.body.data.status,'completed')
    assert.deepEqual(result.body.data.professional_type_ids.sort(),typeIds.slice(0,2).sort())
    assert.equal(result.body.data.attachments.length,1)
    assert.equal(result.body.data.attachments[0].base64,undefined)
    assert.equal(result.body.data.attachments[0].content,undefined)
    const stored = await pool.query('SELECT is_verified,payout_method FROM providers WHERE id=$1',[account.providerId])
    assert.equal(stored.rows[0].is_verified,false)
    assert.equal(stored.rows[0].payout_method,null)
})

test('blank drafts and multiple types survive save/read, completion updates linked types',async()=>{
    const initial = (await request('/providers/registration','GET',undefined,account.token)).body.data
    const blank = form({name:'',document:'',phone_number:'',experience:'',certifications:'',professional_type_ids:[],attachments:initial.attachments,mode:'draft'})
    const saved = await request('/providers/registration','PUT',blank,account.token)
    assert.equal(saved.status,200,JSON.stringify(saved.body))
    assert.equal(saved.body.data.status,'draft')
    assert.equal(saved.body.data.name,'')
    assert.deepEqual(saved.body.data.professional_type_ids,[])
    const reread = await request('/providers/registration','GET',undefined,account.token)
    assert.deepEqual(reread.body.data,saved.body.data)
    assert.equal((await request('/providers/registration','PUT',{...blank,mode:'continue'},account.token)).status,400)
    const completed = await request('/providers/registration','PUT',form({attachments:initial.attachments}),account.token)
    assert.equal(completed.status,200,JSON.stringify(completed.body))
    assert.equal(completed.body.data.status,'completed')
    const links = await pool.query('SELECT professional_type_id FROM provider_professional_types WHERE provider_id=$1',[account.providerId])
    assert.deepEqual(links.rows.map(row=>row.professional_type_id).sort(),typeIds.slice(0,2).sort())
})

test('missing fields and invalid types do not create an account or partially update an existing one',async()=>{
    for(const overrides of [
        {registration:undefined},
        {registration:details({professional_type_ids:[]})},
        {registration:details({professional_type_ids:[typeIds[2]]})},
        {registration:details({professional_type_ids:[crypto.randomUUID()]})},
        {registration:details({experience:'a'.repeat(501)})},
        {registration:details({document:'12345678900'})},
    ]){
        const result = await signup(overrides)
        assert.equal(result.status,400,JSON.stringify(result.body))
        assert.equal((await pool.query('SELECT id FROM users WHERE email=$1',[result.email])).rowCount,0)
    }
    const initial = (await request('/providers/registration','GET',undefined,account.token)).body.data
    const rejected = await request('/providers/registration','PUT',form({name:'Alteração recusada',professional_type_ids:[typeIds[2]]}),account.token)
    assert.equal(rejected.status,400)
    assert.deepEqual((await request('/providers/registration','GET',undefined,account.token)).body.data,initial)
    assert.equal((await request('/providers/registration','PUT',form({email:other.email}),account.token)).status,400)
})

test('files validate actual content and cannot reference another professional evidence',async()=>{
    const current = (await request('/providers/registration','GET',undefined,account.token)).body.data
    const stolen = await request('/providers/registration','PUT',{...form({email:other.email}),attachments:current.attachments},other.token)
    assert.equal(stolen.status,400)
    const invalid = {...file,base64:Buffer.from('not PDF!').toString('base64'),size:8}
    assert.equal((await request('/providers/registration','PUT',form({attachments:[invalid]}),account.token)).status,400)
    assert.equal((await request('/providers/registration','PUT',form({attachments:[{...file,mime_type:'text/plain'}]}),account.token)).status,400)
    assert.equal((await request('/providers/registration','PUT',form({attachments:[{...file,size:10485761}]}),account.token)).status,400)
    const exact = Buffer.alloc(10485760); exact.write('%PDF-1.4')
    const accepted = await request('/providers/registration','PUT',form({attachments:[{name:'limite.pdf',mime_type:'application/pdf',size:exact.length,base64:exact.toString('base64')}]}),account.token)
    assert.equal(accepted.status,200,JSON.stringify(accepted.body))
    const stored = await pool.query('SELECT octet_length(content) AS bytes FROM provider_registration_attachments WHERE provider_id=$1',[account.providerId])
    assert.equal(stored.rows[0].bytes,10485760)
    const removed = await request('/providers/registration','PUT',form(),account.token)
    assert.equal(removed.status,200)
    assert.equal((await pool.query('SELECT id FROM provider_registration_attachments WHERE provider_id=$1',[account.providerId])).rowCount,0)
})

test('types used in active services cannot be removed and verified state is never granted or erased here',async()=>{
    const category = (await pool.query('SELECT id FROM categories LIMIT 1')).rows[0].id
    await pool.query(`INSERT INTO provider_services(provider_id,custom_name,category_id,professional_type_id,is_active,price) VALUES($1,$2,$3,$4,true,50)`,[account.providerId,`Registration service ${crypto.randomUUID()}`,category,typeIds[1]])
    const rejected = await request('/providers/registration','PUT',form({professional_type_ids:[typeIds[0]]}),account.token)
    assert.equal(rejected.status,409)
    await pool.query('UPDATE providers SET is_verified=true WHERE id=$1',[account.providerId])
    assert.equal((await request('/providers/registration','PUT',form(),account.token)).status,200)
    assert.equal((await pool.query('SELECT is_verified FROM providers WHERE id=$1',[account.providerId])).rows[0].is_verified,true)
})
