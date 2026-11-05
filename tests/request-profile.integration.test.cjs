require('dotenv').config({ quiet: true })
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { Pool } = require('pg')
const { hash } = require('bcrypt')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const base = 'http://127.0.0.1:3000/api/v1'
const ids = {
    tutor: randomUUID(),
    tutorQuiet: randomUUID(),
    professional: randomUUID(),
    other: randomUUID(),
    provider: randomUUID(),
    otherProvider: randomUUID(),
    offer: randomUUID(),
    otherOffer: randomUUID(),
    pet: randomUUID(),
    barePet: randomUUID(),
    pending: randomUUID(),
    ownRecent: randomUUID(),
    ownOlder: randomUUID(),
    foreignCompleted: randomUUID(),
    confirmed: randomUUID(),
    otherPetCompleted: randomUUID(),
    cancelled: randomUUID(),
    noPet: randomUUID(),
}
const emails = {
    tutor: `profile-tutor-${ids.tutor}@mygroomer.test`,
    tutorQuiet: `profile-quiet-${ids.tutorQuiet}@mygroomer.test`,
    professional: `profile-pro-${ids.professional}@mygroomer.test`,
    other: `profile-other-${ids.other}@mygroomer.test`,
}
const secretNote = `nota-secreta-${ids.pending}`
const otherNote = `nota-alheia-${ids.foreignCompleted}`
let tutorToken
let professionalToken
let otherToken
let serviceId

const request = async (route, method = 'GET', body, token = professionalToken) => {
    const response = await fetch(base + route, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : {} }
}

const profile = (bookingId, token = professionalToken) => request(`/providers/requests/${bookingId}/profile`, 'GET', undefined, token)
const saveNote = (bookingId, note, token = professionalToken) => request(
    `/providers/requests/${bookingId}/anamnesis-note`, 'PUT', { note }, token,
)
const petBody = (extra = {}) => ({
    name: 'Luna',
    species: 'dog',
    breed: 'SRD',
    size: 'small',
    age_years: 3,
    notes: 'Gosta de carinho',
    ...extra,
})
const insertBooking = (id, values) => pool.query(
    `INSERT INTO bookings(
        id, customer_id, pet_id, provider_service_id, scheduled_at, completed_at,
        customer_location, booking_status, duration_minutes, service_price
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,60,$9)`,
    [id, values.customerId, values.petId, values.offerId, values.scheduledAt, values.completedAt ?? null, values.location, values.status, values.price ?? null],
)

before(async () => {
    assert.equal(process.env.LOCAL_TEST_MODE, 'true')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/mygroomer_dev', 'Refusing nonlocal database')
    const service = await pool.query(`SELECT id FROM services ORDER BY name LIMIT 1`)
    assert.ok(service.rows[0], 'O catálogo de serviços precisa estar semeado')
    serviceId = service.rows[0].id
    const passwordHash = await hash('admin', 10)
    await pool.query(
        `INSERT INTO users(id, name, email, password, role, email_verified_at, phone_number) VALUES
         ($1,'Ana Souza',$2,$3,'customer',NOW(),'11987654321'),
         ($4,'Tutor Sem Fone',$5,$3,'customer',NOW(),'   '),
         ($6,'Groomer da Casa',$7,$3,'provider',NOW(),NULL),
         ($8,'Groomer Vizinho',$9,$3,'provider',NOW(),NULL)`,
        [ids.tutor, emails.tutor, passwordHash, ids.tutorQuiet, emails.tutorQuiet, ids.professional, emails.professional, ids.other, emails.other],
    )
    await pool.query(
        `INSERT INTO providers(id, user_id, travel_gap_minutes, manual_fit) VALUES ($1,$2,30,false), ($3,$4,30,false)`,
        [ids.provider, ids.professional, ids.otherProvider, ids.other],
    )
    await pool.query(
        `INSERT INTO provider_services(
            id, provider_id, service_id, price, is_active, custom_name,
            price_small, price_medium, price_large, duration_small_minutes, duration_medium_minutes, duration_large_minutes
         ) VALUES
         ($1,$2,$3,120,true,'Banho da casa',120,140,160,30,60,90),
         ($4,$5,$3,90,true,'Banho do vizinho',90,110,130,30,60,90)`,
        [ids.offer, ids.provider, serviceId, ids.otherOffer, ids.otherProvider],
    )
    await pool.query(
        `INSERT INTO pets(id, owner_id, name, species, breed, size, age_years, notes) VALUES
         ($1,$2,'Luna','dog','SRD','small',3,'Gosta de carinho'),
         ($3,$2,'Thor','dog','Poodle','medium',5,NULL)`,
        [ids.pet, ids.tutor, ids.barePet],
    )
    const location = 'Rua das Flores, 123'
    await insertBooking(ids.ownRecent, {
        customerId: ids.tutor, petId: ids.pet, offerId: ids.offer, status: 'completed',
        scheduledAt: '2026-03-01T13:00:00.000Z', completedAt: '2026-03-01T15:00:00.000Z', location, price: 80,
    })
    await insertBooking(ids.foreignCompleted, {
        customerId: ids.tutor, petId: ids.pet, offerId: ids.otherOffer, status: 'completed',
        scheduledAt: '2026-02-01T13:00:00.000Z', completedAt: '2026-02-01T15:00:00.000Z', location, price: 70,
    })
    await insertBooking(ids.ownOlder, {
        customerId: ids.tutor, petId: ids.pet, offerId: ids.offer, status: 'completed',
        scheduledAt: '2026-01-01T13:00:00.000Z', completedAt: '2026-01-01T15:00:00.000Z', location, price: null,
    })
    await insertBooking(ids.confirmed, {
        customerId: ids.tutor, petId: ids.pet, offerId: ids.offer, status: 'confirmed',
        scheduledAt: '2026-04-01T13:00:00.000Z', location, price: 50,
    })
    await insertBooking(ids.otherPetCompleted, {
        customerId: ids.tutor, petId: ids.barePet, offerId: ids.offer, status: 'completed',
        scheduledAt: '2026-03-15T13:00:00.000Z', completedAt: '2026-03-15T15:00:00.000Z', location, price: 40,
    })
    await insertBooking(ids.pending, {
        customerId: ids.tutor, petId: ids.pet, offerId: ids.offer, status: 'pending_confirmation',
        scheduledAt: '2026-05-01T13:00:00.000Z', location, price: 120,
    })
    await insertBooking(ids.cancelled, {
        customerId: ids.tutor, petId: ids.pet, offerId: ids.offer, status: 'cancelled',
        scheduledAt: '2026-05-02T13:00:00.000Z', location, price: 120,
    })
    await insertBooking(ids.noPet, {
        customerId: ids.tutorQuiet, petId: null, offerId: ids.offer, status: 'pending_confirmation',
        scheduledAt: '2026-05-03T13:00:00.000Z', location: 'Rua sem pet, 1', price: 120,
    })

    const tutor = await request('/auth/login', 'POST', { email: emails.tutor, password: 'admin' }, null)
    const professional = await request('/auth/login', 'POST', { email: emails.professional, password: 'admin' }, null)
    const other = await request('/auth/login', 'POST', { email: emails.other, password: 'admin' }, null)
    assert.equal(tutor.status, 200, JSON.stringify(tutor.body))
    assert.equal(professional.status, 200, JSON.stringify(professional.body))
    assert.equal(other.status, 200, JSON.stringify(other.body))
    tutorToken = tutor.body.token
    professionalToken = professional.body.token
    otherToken = other.body.token
})

after(async () => {
    const bookingIds = [
        ids.pending, ids.ownRecent, ids.ownOlder, ids.foreignCompleted, ids.confirmed,
        ids.otherPetCompleted, ids.cancelled, ids.noPet,
    ]
    await pool.query('DELETE FROM pet_anamnesis_notes WHERE booking_id = ANY($1::uuid[])', [bookingIds]).catch(() => {})
    await pool.query('DELETE FROM bookings WHERE id = ANY($1::uuid[])', [bookingIds]).catch(() => {})
    await pool.query('DELETE FROM pets WHERE id = ANY($1::uuid[])', [[ids.pet, ids.barePet]]).catch(() => {})
    await pool.query('DELETE FROM provider_services WHERE id = ANY($1::uuid[])', [[ids.offer, ids.otherOffer]]).catch(() => {})
    await pool.query('DELETE FROM providers WHERE id = ANY($1::uuid[])', [[ids.provider, ids.otherProvider]]).catch(() => {})
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ids.tutor, ids.tutorQuiet, ids.professional, ids.other]]).catch(() => {})
    await pool.end()
})

test('AC-02 a AC-07 ficha, anamnese, nota e histórico', async () => {
    const opened = await profile(ids.pending)
    assert.equal(opened.status, 200, JSON.stringify(opened.body))
    const data = opened.body.data
    assert.equal(data.customer.name, 'Ana Souza')
    assert.equal(data.customer.phone_number, '11987654321')
    assert.equal(data.customer.previous_bookings_with_provider, 3)
    assert.equal(data.booking.customer_location, 'Rua das Flores, 123')
    assert.equal(data.booking.service_name, 'Banho da casa')
    assert.equal(data.pet.name, 'Luna')
    assert.equal(data.pet.species, 'dog')
    assert.equal(data.pet.breed, 'SRD')
    assert.equal(data.pet.size, 'small')
    assert.equal(data.pet.age_years, 3)
    assert.equal(data.pet.notes, 'Gosta de carinho')
    assert.equal(data.pet.photo_url, null)
    assert.equal(data.history.some(item => item.booking_id === ids.confirmed), false)
    assert.equal(data.history.some(item => item.booking_id === ids.otherPetCompleted), false)
    assert.deepEqual(data.history.map(item => item.booking_id), [ids.ownRecent, ids.foreignCompleted, ids.ownOlder])
    assert.equal(data.history[0].own, true)
    assert.equal(data.history[0].price, 80)
    assert.equal(data.history[0].provider_name, 'Groomer da Casa')
    assert.equal(data.history[1].own, false)
    assert.equal(data.history[1].price, null)
    assert.equal(data.history[1].provider_name, 'Groomer Vizinho')
    assert.equal(data.history[1].service_name, 'Banho do vizinho')
    assert.equal(JSON.stringify(data.history[1]).includes('70'), false)
    assert.equal(data.history[2].own, true)
    assert.equal(data.history[2].price, 120)

    const quiet = await profile(ids.noPet)
    assert.equal(quiet.status, 200, JSON.stringify(quiet.body))
    assert.equal(quiet.body.data.customer.phone_number, null)
    assert.equal(quiet.body.data.pet, null)
    assert.equal(quiet.body.data.anamnesis, null)
    assert.deepEqual(quiet.body.data.history, [])
    assert.deepEqual(quiet.body.data.notes, [])

    const anamnesis = {
        allergies: '  Pólen  ',
        medications: 'Apoquel',
        health_conditions: 'Otite',
        vaccination_up_to_date: true,
        behavior: 'Ansioso',
        special_care: 'Secador baixo',
    }
    const savedPet = await request(`/pets/${ids.pet}`, 'PATCH', petBody(anamnesis), tutorToken)
    assert.equal(savedPet.status, 200, JSON.stringify(savedPet.body))
    assert.equal(savedPet.body.data.allergies, 'Pólen')
    const readPet = await request(`/pets/${ids.pet}`, 'GET', undefined, tutorToken)
    assert.equal(readPet.body.data.medications, 'Apoquel')
    assert.equal(readPet.body.data.vaccination_up_to_date, true)
    const tooLong = await request(`/pets/${ids.pet}`, 'PATCH', petBody({ allergies: 'a'.repeat(501) }), tutorToken)
    assert.equal(tooLong.status, 400)
    assert.equal(tooLong.body.errors.some(error => error.field === 'allergies' && error.message === 'A anamnese deve ter no máximo 500 caracteres'), true)
    const cleared = await request(`/pets/${ids.pet}`, 'PATCH', petBody({
        allergies: '   ',
        medications: 'Apoquel',
        health_conditions: 'Otite',
        vaccination_up_to_date: false,
        behavior: 'Ansioso',
        special_care: 'Secador baixo',
    }), tutorToken)
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body))
    assert.equal(cleared.body.data.allergies, null)
    assert.equal(cleared.body.data.vaccination_up_to_date, false)

    const filled = await profile(ids.pending)
    assert.equal(filled.body.data.anamnesis.allergies, null)
    assert.equal(filled.body.data.anamnesis.medications, 'Apoquel')
    assert.equal(filled.body.data.anamnesis.vaccination_up_to_date, false)

    const bare = await profile(ids.otherPetCompleted)
    assert.equal(bare.body.data.anamnesis.allergies, null)
    assert.equal(bare.body.data.anamnesis.behavior, null)
    assert.deepEqual(bare.body.data.notes, [])

    const created = await saveNote(ids.pending, secretNote)
    assert.equal(created.status, 200, JSON.stringify(created.body))
    assert.equal(created.body.data.note, secretNote)
    const replaced = await saveNote(ids.pending, `${secretNote}-editada`)
    assert.equal(replaced.status, 200)
    assert.equal(replaced.body.data.id, created.body.data.id)
    const withNote = await profile(ids.pending)
    assert.equal(withNote.body.data.notes.length, 1)
    assert.equal(withNote.body.data.notes[0].note, `${secretNote}-editada`)
    assert.ok(withNote.body.data.notes[0].created_at)

    const tutorPets = await request('/pets', 'GET', undefined, tutorToken)
    assert.equal(JSON.stringify(tutorPets.body).includes(secretNote), false)
    const tutorPet = await request(`/pets/${ids.pet}`, 'GET', undefined, tutorToken)
    assert.equal(JSON.stringify(tutorPet.body).includes(secretNote), false)

    const foreignWrite = await saveNote(ids.foreignCompleted, otherNote, otherToken)
    assert.equal(foreignWrite.status, 200, JSON.stringify(foreignWrite.body))
    const hidden = await profile(ids.pending)
    assert.equal(hidden.body.data.notes.some(item => item.note === otherNote), false)
    const otherView = await profile(ids.foreignCompleted, otherToken)
    assert.equal(otherView.status, 200)
    assert.equal(otherView.body.data.notes.some(item => item.note.includes(secretNote)), false)
    assert.equal(otherView.body.data.notes.some(item => item.note === otherNote), true)

    const forbidden = await profile(ids.pending, otherToken)
    assert.equal(forbidden.status, 403)
    assert.equal(forbidden.body.message, 'Você não participa deste agendamento')
    const beforeCount = await pool.query('SELECT COUNT(*)::int AS count FROM pet_anamnesis_notes')
    const forbiddenNote = await saveNote(ids.pending, 'nao pode', otherToken)
    assert.equal(forbiddenNote.status, 403)
    const afterCount = await pool.query('SELECT COUNT(*)::int AS count FROM pet_anamnesis_notes')
    assert.equal(afterCount.rows[0].count, beforeCount.rows[0].count)

    const tutorProfile = await profile(ids.pending, tutorToken)
    assert.equal(tutorProfile.status, 404)
    assert.equal(tutorProfile.body.message, 'Perfil do groomer não encontrado')
    assert.equal((await profile('nao-e-uuid')).status, 400)
    assert.equal((await profile(randomUUID())).status, 404)

    const cancelled = await saveNote(ids.cancelled, 'tarde demais')
    assert.equal(cancelled.status, 409)
    assert.equal(cancelled.body.message, 'Este atendimento não aceita nota.')
    const missingPet = await saveNote(ids.noPet, 'sem pet')
    assert.equal(missingPet.status, 409)
    assert.equal(missingPet.body.message, 'Este agendamento não tem pet para receber a nota.')
    const blank = await saveNote(ids.pending, '   ')
    assert.equal(blank.status, 400)
})

test('AC-06 o histórico devolve no máximo 100 atendimentos, do mais recente', async () => {
    const capPet = randomUUID()
    const bookingIds = Array.from({ length: 101 }, () => randomUUID())
    await pool.query(
        `INSERT INTO pets(id, owner_id, name, species, breed, size, age_years) VALUES ($1,$2,'Cap','dog','SRD','small',1)`,
        [capPet, ids.tutor],
    )
    try {
        const start = Date.parse('2020-01-01T12:00:00.000Z')
        for (let index = 0; index < bookingIds.length; index += 1) {
            const at = new Date(start + index * 86400000).toISOString()
            await insertBooking(bookingIds[index], {
                customerId: ids.tutor,
                petId: capPet,
                offerId: ids.offer,
                status: 'completed',
                scheduledAt: at,
                completedAt: at,
                location: 'Rua do teto',
                price: 10,
            })
        }
        const opened = await profile(bookingIds[100])
        assert.equal(opened.status, 200, JSON.stringify(opened.body))
        assert.equal(opened.body.data.history.length, 100)
        assert.equal(opened.body.data.history[0].booking_id, bookingIds[100])
        assert.equal(opened.body.data.history.some(item => item.booking_id === bookingIds[0]), false)
    } finally {
        await pool.query('DELETE FROM bookings WHERE id = ANY($1::uuid[])', [bookingIds])
        await pool.query('DELETE FROM pets WHERE id = $1', [capPet])
    }
})
