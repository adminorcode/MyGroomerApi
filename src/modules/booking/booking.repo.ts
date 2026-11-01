import { PoolClient } from 'pg'
import { logger } from '../../config/logger.config'
import { col, execute, sql } from '../../shared/db/drizzle'
import { Booking, BookingStatus, CreateBookingInput } from './booking.types'
import { bookings } from './booking.table'
import { QueryType } from '../../types/pagination.types'

const serviceNameSql = `COALESCE(NULLIF(btrim(provider_services.custom_name), ''), services.name)`

const normalizeBookingRow = (row: Booking | undefined): Booking | null => {
    if (!row) return null
    return {
        ...row,
        price: row.price == null ? row.price : Number(row.price),
        service_price: row.service_price == null ? row.service_price : Number(row.service_price),
    }
}

const bookingDetailSelect = sql`
        SELECT
            ${bookings}.*,
            users.name as customer_name,
            users.email as customer_email,
            COALESCE(${bookings.service_price}, provider_services.price)::float AS price,
            ${sql.raw(serviceNameSql)} as service_name,
            provider_users.name as provider_name,
            provider_users.id as provider_user_id,
            reviews.id as review_id,
            pets.name AS pet_name,
            pets.species AS pet_species,
            pets.breed AS pet_breed,
            pets.size AS pet_size,
            pets.age_years AS pet_age_years,
            pets.notes AS pet_notes
        FROM ${bookings}
        LEFT JOIN pets ON ${bookings.pet_id} = pets.id
        LEFT JOIN users ON ${bookings.customer_id} = users.id
        LEFT JOIN provider_services ON ${bookings.provider_service_id} = provider_services.id
        LEFT JOIN services ON provider_services.service_id = services.id
        LEFT JOIN providers ON provider_services.provider_id = providers.id
        LEFT JOIN users AS provider_users ON providers.user_id = provider_users.id
        LEFT JOIN reviews ON reviews.booking_id = ${bookings.id}
`

export const insertBooking = async (
    bookingId: string,
    bookingInput: CreateBookingInput,
    initialStatus: BookingStatus,
    client?: PoolClient,
): Promise<Booking | null> => {
    const result = await execute<Booking>(client, sql`
        INSERT INTO ${bookings} (
            id, customer_id, pet_id, provider_service_id, scheduled_at, customer_location, booking_status,
            customer_latitude, customer_longitude, duration_minutes, service_price
        )
        VALUES (
            ${bookingId}, ${bookingInput.customer_id}, ${bookingInput.pet_id}, ${bookingInput.provider_service_id},
            ${bookingInput.scheduled_at}, ${bookingInput.customer_location}, ${initialStatus},
            ${bookingInput.customer_latitude ?? null}, ${bookingInput.customer_longitude ?? null},
            ${bookingInput.duration_minutes ?? null}, ${bookingInput.service_price ?? null}
        )
        RETURNING *
    `)
    return result.rows[0] || null
}

export const findBookingById = async (bookingId: string, client?: PoolClient): Promise<Booking | null> => {
    const result = await execute<Booking>(client, sql`${bookingDetailSelect} WHERE ${bookings.id} = ${bookingId}`)
    return normalizeBookingRow(result.rows[0])
}

export const findOpenBookingRequest = async (
    customerId: string,
    petId: string,
    providerUserId: string,
    scheduledAt: string,
    client?: PoolClient,
): Promise<Booking | null> => {
    const result = await execute<Booking>(client, sql`
        ${bookingDetailSelect}
        WHERE ${bookings.customer_id} = ${customerId}
          AND ${bookings.pet_id} = ${petId}
          AND provider_users.id = ${providerUserId}
          AND ${bookings.scheduled_at} = ${scheduledAt}::timestamptz
          AND ${bookings.booking_status} IS DISTINCT FROM ${BookingStatus.CANCELLED}
        ORDER BY ${bookings.created_at} ASC
        LIMIT 1
    `)
    return normalizeBookingRow(result.rows[0])
}

export const fetchBookings = async (
    query: QueryType,
    customer_id?: string,
    provider_user_id?: string,
    status?: BookingStatus,
    client?: PoolClient,
): Promise<Booking[] | null> => {
    const conditions = []
    if (customer_id) conditions.push(sql`${bookings.customer_id} = ${customer_id}`)
    if (provider_user_id) conditions.push(sql`provider_users.id = ${provider_user_id}`)
    if (status) conditions.push(sql`${bookings.booking_status} = ${status}`)
    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``
    const page = query?.page || 1
    const limit = query?.limit || 10
    const offset = (page - 1) * limit
    const result = await execute<Booking>(client, sql`
        SELECT
            ${bookings}.*,
            services.name AS service_name,
            COALESCE(${bookings.service_price}, provider_services.price)::float AS price,
            provider_users.name AS provider_name,
            customer_users.name AS customer_name,
            pets.name AS pet_name,
            pets.species AS pet_species,
            pets.breed AS pet_breed,
            pets.size AS pet_size,
            pets.age_years AS pet_age_years,
            pets.notes AS pet_notes
        FROM ${bookings}
        LEFT JOIN pets ON ${bookings.pet_id} = pets.id
        LEFT JOIN provider_services ON ${bookings.provider_service_id} = provider_services.id
        LEFT JOIN services ON provider_services.service_id = services.id
        LEFT JOIN providers ON provider_services.provider_id = providers.id
        LEFT JOIN users AS provider_users ON providers.user_id = provider_users.id
        LEFT JOIN users AS customer_users ON ${bookings.customer_id} = customer_users.id
        ${whereClause}
        ORDER BY ${bookings.created_at} DESC
        LIMIT ${limit} OFFSET ${offset}
    `)
    return result.rows || null
}

export const updateBookingStatus = async (
    bookingId: string,
    update: { booking_status: BookingStatus, mark_provider_rejected?: boolean },
    client?: PoolClient,
    expectedStatus?: BookingStatus,
): Promise<Booking | null> => {
    const expectedFilter = expectedStatus
        ? sql` AND ${bookings.booking_status} = ${expectedStatus}`
        : sql``
    const result = await execute<Booking>(client, sql`
        UPDATE ${bookings}
        SET ${col(bookings.booking_status)} = ${update.booking_status},
            ${col(bookings.updated_at)} = NOW(),
            ${col(bookings.completed_at)} = CASE WHEN ${update.booking_status} = 'completed' THEN NOW() ELSE ${bookings.completed_at} END,
            ${col(bookings.provider_rejected_at)} = CASE WHEN ${update.mark_provider_rejected === true} THEN NOW() ELSE ${bookings.provider_rejected_at} END
        WHERE ${bookings.id} = ${bookingId}${expectedFilter}
        RETURNING *
    `)
    return result.rows[0] || null
}

export const lockBookingStatus = async (bookingId: string, client: PoolClient): Promise<BookingStatus | null> => {
    const result = await execute<{ booking_status: BookingStatus }>(client, sql`
        SELECT ${bookings.booking_status} AS booking_status
        FROM ${bookings}
        WHERE ${bookings.id} = ${bookingId}
        FOR UPDATE
    `)
    return result.rows[0]?.booking_status ?? null
}

export const moveBookingToPendingConfirmation = async (bookingId: string, client: PoolClient): Promise<Booking | null> => {
    const result = await execute<Booking>(client, sql`
        UPDATE ${bookings}
        SET ${col(bookings.booking_status)} = ${BookingStatus.PENDING_CONFIRMATION},
            ${col(bookings.updated_at)} = NOW()
        WHERE ${bookings.id} = ${bookingId}
          AND ${bookings.booking_status} = ${BookingStatus.PENDING_PAYMENT}
        RETURNING *
    `)
    return result.rows[0] || null
}

export const providerServiceHasBookings = async (providerServiceId: string, client?: PoolClient): Promise<boolean> => {
    const result = await execute(client, sql`
        SELECT 1 FROM ${bookings} WHERE ${bookings.provider_service_id} = ${providerServiceId} LIMIT 1
    `)
    return (result.rowCount ?? 0) > 0
}

export const isBookingProvider = async (bookingId: string, userId: string, client?: PoolClient): Promise<boolean> => {
    try {
        const result = await execute(client, sql`
            SELECT 1 FROM ${bookings}
            JOIN provider_services ON ${bookings.provider_service_id} = provider_services.id
            JOIN providers ON provider_services.provider_id = providers.id
            WHERE ${bookings.id} = ${bookingId} AND providers.user_id = ${userId}
        `)
        return (result.rowCount ?? 0) > 0
    } catch (error) {
        logger.error('booking ownership check error', { error })
        throw error
    }
}
