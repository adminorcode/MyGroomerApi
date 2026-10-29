import { PoolClient } from 'pg'
import { logger } from '../../config/logger.config'
import { executor } from '../../shared/db/transaction'
import { Booking, BookingStatus, CreateBookingInput } from './booking.types'
import { QueryType } from '../../types/pagination.types'

export const insertBooking = async (
    bookingId: string,
    bookingInput: CreateBookingInput,
    initialStatus: BookingStatus,
    client?: PoolClient,
): Promise<Booking | null> => {
    const result = await executor(client).query(
        `
        INSERT INTO bookings
            (id, customer_id, pet_id, provider_service_id, scheduled_at, customer_location, booking_status, customer_latitude, customer_longitude)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        `,
        [
            bookingId,
            bookingInput.customer_id,
            bookingInput.pet_id,
            bookingInput.provider_service_id,
            bookingInput.scheduled_at,
            bookingInput.customer_location,
            initialStatus,
            bookingInput.customer_latitude,
            bookingInput.customer_longitude,
        ],
    )
    return result.rows[0] || null
}

export const findBookingById = async (bookingId: string, client?: PoolClient): Promise<Booking | null> => {
    const result = await executor(client).query(
        `SELECT
            bookings.*,
            users.name as customer_name,
            users.email as customer_email,
            provider_services.price,
            services.name as service_name,
            provider_users.name as provider_name,
            provider_users.id as provider_user_id,
            reviews.id as review_id,
            pets.name AS pet_name,
            pets.species AS pet_species,
            pets.breed AS pet_breed,
            pets.size AS pet_size,
            pets.age_years AS pet_age_years,
            pets.notes AS pet_notes
        FROM bookings
        LEFT JOIN pets ON bookings.pet_id = pets.id
        LEFT JOIN users ON bookings.customer_id = users.id
        LEFT JOIN provider_services ON bookings.provider_service_id = provider_services.id
        LEFT JOIN services ON provider_services.service_id = services.id
        LEFT JOIN providers ON provider_services.provider_id = providers.id
        LEFT JOIN users AS provider_users ON providers.user_id = provider_users.id
        LEFT JOIN reviews ON reviews.booking_id = bookings.id
        WHERE bookings.id = $1
        `,
        [bookingId],
    )
    return result.rows[0] || null
}

export const fetchBookings = async (
    query: QueryType,
    customer_id?: string,
    provider_user_id?: string,
    status?: BookingStatus,
    client?: PoolClient,
): Promise<Booking[] | null> => {
    const conditions: string[] = []
    const values: unknown[] = []
    let index = 1

    if (customer_id) {
        conditions.push(`bookings.customer_id = $${index++}`)
        values.push(customer_id)
    }

    if (provider_user_id) {
        conditions.push(`provider_users.id=$${index++}`)
        values.push(provider_user_id)
    }

    if (status) {
        conditions.push(`bookings.booking_status = $${index++}`)
        values.push(status)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const page = query?.page || 1
    const limit = query?.limit || 10
    const offset = (page - 1) * limit
    values.push(limit)
    values.push(offset)

    const result = await executor(client).query(
        `
        SELECT
            bookings.*,
            services.name AS service_name,
            provider_services.price,
            provider_users.name AS provider_name,
            customer_users.name AS customer_name,
            pets.name AS pet_name,
            pets.species AS pet_species,
            pets.breed AS pet_breed,
            pets.size AS pet_size,
            pets.age_years AS pet_age_years,
            pets.notes AS pet_notes
        FROM bookings
        LEFT JOIN pets ON bookings.pet_id = pets.id
        LEFT JOIN provider_services ON bookings.provider_service_id = provider_services.id
        LEFT JOIN services ON provider_services.service_id = services.id
        LEFT JOIN providers ON provider_services.provider_id = providers.id
        LEFT JOIN users AS provider_users ON providers.user_id = provider_users.id
        LEFT JOIN users AS customer_users ON bookings.customer_id = customer_users.id
        ${whereClause}
        ORDER BY bookings.created_at DESC
        LIMIT $${index++} OFFSET $${index}
        `,
        values,
    )
    return result.rows || null
}

export const updateBookingStatus = async (
    bookingId: string,
    update: { booking_status: BookingStatus },
    client?: PoolClient,
): Promise<Booking | null> => {
    const result = await executor(client).query(
        `
        UPDATE bookings
        SET booking_status = $1,
        updated_at = NOW(),
        completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
        WHERE id = $3
        RETURNING *
        `,
        [update.booking_status, update.booking_status, bookingId],
    )
    return result.rows[0] || null
}

export const lockBookingStatus = async (bookingId: string, client: PoolClient): Promise<BookingStatus | null> => {
    const result = await client.query(
        `SELECT booking_status FROM bookings WHERE id = $1 FOR UPDATE`,
        [bookingId],
    )
    return result.rows[0]?.booking_status ?? null
}

export const moveBookingToPendingConfirmation = async (bookingId: string, client: PoolClient): Promise<Booking | null> => {
    const result = await client.query(
        `
        UPDATE bookings
        SET booking_status = $1,
            updated_at = NOW()
        WHERE id = $2 AND booking_status = $3
        RETURNING *
        `,
        [BookingStatus.PENDING_CONFIRMATION, bookingId, BookingStatus.PENDING_PAYMENT],
    )
    return result.rows[0] || null
}

export const providerServiceHasBookings = async (providerServiceId: string, client?: PoolClient): Promise<boolean> => {
    const result = await executor(client).query(
        `SELECT 1 FROM bookings WHERE provider_service_id = $1 LIMIT 1`,
        [providerServiceId],
    )
    return (result.rowCount ?? 0) > 0
}

export const isBookingProvider = async (bookingId: string, userId: string, client?: PoolClient): Promise<boolean> => {
    try {
        const result = await executor(client).query(
            `
            SELECT 1 FROM bookings
            JOIN provider_services ON bookings.provider_service_id = provider_services.id
            JOIN providers ON provider_services.provider_id = providers.id
            WHERE bookings.id = $1 AND providers.user_id = $2
            `,
            [bookingId, userId],
        )
        return (result.rowCount ?? 0) > 0
    } catch (error) {
        logger.error('booking ownership check error', { error })
        throw error
    }
}
