import { AppError } from '../../shared/errors'
import { execute, sql } from '../../shared/db/drizzle'
import { petAnamnesisNotes } from './pet-anamnesis-note.table'
import { providerServices } from './provider.table'

type BookingRow = {
    id: string
    booking_status: string
    scheduled_at: Date
    customer_location: string | null
    customer_id: string | null
    pet_id: string | null
    service_name: string | null
    provider_id: string
}

type CustomerRow = { name: string | null, phone_number: string | null }
type CountRow = { count: number }
type PetRow = {
    id: string
    name: string
    species: 'dog' | 'cat' | 'other'
    breed: string
    size: 'small' | 'medium' | 'large'
    age_years: number
    notes: string | null
    photo_url: string | null
    allergies: string | null
    medications: string | null
    health_conditions: string | null
    vaccination_up_to_date: boolean | null
    behavior: string | null
    special_care: string | null
}
type NoteRow = { id: string, booking_id: string, note: string, created_at: Date }
type HistoryRow = {
    booking_id: string
    completed_at: Date
    service_name: string | null
    provider_name: string | null
    own: boolean | string
    price: string | number | null
}

const isOwn = (value: boolean | string) => value === true || value === 't' || value === 'true'

const asPrice = (value: string | number | null): number | null => {
    if (value == null || value === '') return null
    const price = Number(value)
    return Number.isFinite(price) ? price : null
}

const loadBooking = async (bookingId: string): Promise<BookingRow> => {
    const result = await execute<BookingRow>(undefined, sql`
        SELECT
            b.id,
            b.booking_status,
            b.scheduled_at,
            b.customer_location,
            b.customer_id,
            b.pet_id,
            COALESCE(NULLIF(btrim(${providerServices.custom_name}), ''), services.name) AS service_name,
            ${providerServices.provider_id} AS provider_id
        FROM bookings b
        JOIN ${providerServices} ON provider_services.id = b.provider_service_id
        LEFT JOIN services ON services.id = provider_services.service_id
        WHERE b.id = ${bookingId}
    `)
    const booking = result.rows[0]
    if (!booking) throw new AppError('Agendamento não encontrado', 404)
    return booking
}

const assertOwner = (booking: BookingRow, providerId: string) => {
    if (booking.provider_id !== providerId) {
        throw new AppError('Você não participa deste agendamento', 403)
    }
}

export const getProviderRequestProfile = async (providerId: string, bookingId: string) => {
    const booking = await loadBooking(bookingId)
    assertOwner(booking, providerId)

    const customer = booking.customer_id
        ? (await execute<CustomerRow>(undefined, sql`
            SELECT name, NULLIF(btrim(phone_number), '') AS phone_number
            FROM users
            WHERE id = ${booking.customer_id}
        `)).rows[0]
        : undefined

    const previous = booking.customer_id
        ? (await execute<CountRow>(undefined, sql`
            SELECT COUNT(*)::int AS count
            FROM bookings b
            JOIN ${providerServices} ON provider_services.id = b.provider_service_id
            WHERE b.customer_id = ${booking.customer_id}
              AND ${providerServices.provider_id} = ${providerId}
              AND b.booking_status = 'completed'
              AND b.id <> ${booking.id}
        `)).rows[0]?.count ?? 0
        : 0

    const pet = booking.pet_id
        ? (await execute<PetRow>(undefined, sql`
            SELECT
                id, name, species, breed, size, age_years, notes, photo_url,
                allergies, medications, health_conditions, vaccination_up_to_date, behavior, special_care
            FROM pets
            WHERE id = ${booking.pet_id}
        `)).rows[0]
        : undefined

    const notes = pet
        ? (await execute<NoteRow>(undefined, sql`
            SELECT id, booking_id, note, created_at
            FROM ${petAnamnesisNotes}
            WHERE pet_id = ${pet.id} AND provider_id = ${providerId}
            ORDER BY created_at DESC, id DESC
        `)).rows
        : []

    const history = pet
        ? (await execute<HistoryRow>(undefined, sql`
            SELECT
                b.id AS booking_id,
                COALESCE(b.completed_at, b.scheduled_at) AS completed_at,
                COALESCE(NULLIF(btrim(${providerServices.custom_name}), ''), services.name) AS service_name,
                users.name AS provider_name,
                (${providerServices.provider_id} = ${providerId}) AS own,
                CASE
                    WHEN ${providerServices.provider_id} = ${providerId}
                        THEN COALESCE(b.service_price, ${providerServices.price})
                    ELSE NULL
                END AS price
            FROM bookings b
            JOIN ${providerServices} ON provider_services.id = b.provider_service_id
            JOIN providers ON providers.id = ${providerServices.provider_id}
            JOIN users ON users.id = providers.user_id
            LEFT JOIN services ON services.id = ${providerServices.service_id}
            WHERE b.pet_id = ${pet.id}
              AND b.booking_status = 'completed'
            ORDER BY COALESCE(b.completed_at, b.scheduled_at) DESC, b.id DESC
            LIMIT 100
        `)).rows
        : []

    return {
        booking: {
            id: booking.id,
            booking_status: booking.booking_status,
            scheduled_at: booking.scheduled_at,
            service_name: booking.service_name ?? '',
            customer_location: booking.customer_location,
        },
        customer: {
            name: customer?.name?.trim() || '',
            phone_number: customer?.phone_number ?? null,
            previous_bookings_with_provider: Number(previous) || 0,
        },
        pet: pet ? {
            id: pet.id,
            name: pet.name,
            species: pet.species,
            breed: pet.breed,
            size: pet.size,
            age_years: pet.age_years,
            notes: pet.notes,
            photo_url: pet.photo_url,
        } : null,
        anamnesis: pet ? {
            allergies: pet.allergies,
            medications: pet.medications,
            health_conditions: pet.health_conditions,
            vaccination_up_to_date: pet.vaccination_up_to_date,
            behavior: pet.behavior,
            special_care: pet.special_care,
        } : null,
        notes: notes.map(note => ({
            id: note.id,
            booking_id: note.booking_id,
            note: note.note,
            created_at: note.created_at,
        })),
        history: history.map(item => ({
            booking_id: item.booking_id,
            completed_at: item.completed_at,
            service_name: item.service_name ?? '',
            provider_name: item.provider_name ?? '',
            own: isOwn(item.own),
            price: isOwn(item.own) ? asPrice(item.price) : null,
        })),
    }
}

export const saveAnamnesisNote = async (providerId: string, bookingId: string, note: string) => {
    const booking = await loadBooking(bookingId)
    assertOwner(booking, providerId)
    if (!booking.pet_id) throw new AppError('Este agendamento não tem pet para receber a nota.', 409)
    if (booking.booking_status === 'cancelled') throw new AppError('Este atendimento não aceita nota.', 409)

    const saved = await execute<NoteRow>(undefined, sql`
        INSERT INTO ${petAnamnesisNotes} (pet_id, provider_id, booking_id, note)
        VALUES (${booking.pet_id}, ${providerId}, ${booking.id}, ${note})
        ON CONFLICT (booking_id) DO UPDATE
        SET note = EXCLUDED.note,
            updated_at = NOW()
        RETURNING id, booking_id, note, created_at
    `)
    const row = saved.rows[0]
    if (!row) throw new AppError('Não foi possível salvar a nota', 500)
    return {
        id: row.id,
        booking_id: row.booking_id,
        note: row.note,
        created_at: row.created_at,
    }
}
