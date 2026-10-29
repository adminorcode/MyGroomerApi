import { getPool } from '../../config/database.config'
import { logger } from '../../config/logger.config'
import { findBookingById } from '../booking/booking.service'
import { findProviderByUserId } from '../provider/provider.service'
import { AppError } from '../../shared/errors'
import { QueryType } from '../../types/pagination.types'
import { BookingStatus } from '../booking/booking.types'
import { Role } from '../auth/user.types'
import { CreateReviewInput, Review } from './review.types'

export const insertReview = async (reviewInput: CreateReviewInput): Promise<Review | null> => {
    try {
        const pool = getPool()
        const result = await pool.query(
            `
            INSERT INTO reviews (customer_id, provider_user_id, booking_id, rating, comment)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            `,
            [
                reviewInput.customer_id,
                reviewInput.provider_user_id,
                reviewInput.booking_id,
                reviewInput.rating,
                reviewInput.comment,
            ],
        )
        return result.rows[0] || null
    } catch (error) {
        logger.error('insertReview error', { error })
        throw error
    }
}

export const findReviewByBookingId = async (bookingId: string): Promise<Review | null> => {
    try {
        const pool = getPool()
        const result = await pool.query(`SELECT * FROM reviews WHERE booking_id = $1`, [bookingId])
        return result.rows[0] || null
    } catch (error) {
        logger.error('findReviewByBookingId error', { error })
        throw error
    }
}

export const fetchReviews = async (query: QueryType, customerId?: string, providerUserId?: string): Promise<Review[]> => {
    try {
        const conditions = []
        const values = []
        let index = 1

        if (customerId) {
            conditions.push(`customer_id=$${index++}`)
            values.push(customerId)
        }

        if (providerUserId) {
            conditions.push(`provider_user_id=$${index++}`)
            values.push(providerUserId)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const limit = query.limit || 10
        const page = query.page || 1
        const offset = (page - 1) * limit
        values.push(limit)
        values.push(offset)

        const pool = getPool()
        const result = await pool.query(
            `
            SELECT * FROM reviews
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${index++} OFFSET $${index}
            `,
            values,
        )
        return result.rows
    } catch (error) {
        logger.error('fetchCustomerReviews error', { error })
        throw error
    }
}

export const fetchReviewById = async (reviewId: string) => {
    const pool = getPool()
    try {
        const result = await pool.query(`SELECT * FROM reviews WHERE id=$1`, [reviewId])
        return result.rows[0]
    } catch (error) {
        logger.error('fetchReviewById error', { error })
        throw error
    }
}

export const createReviewForCustomer = async (
    customerId: string,
    body: { booking_id?: string; rating?: number; comment?: string },
) => {
    const { booking_id, rating, comment } = body
    if (!booking_id || !rating || !comment) throw new AppError('Missing required fields', 400)

    const booking = await findBookingById(booking_id)
    if (!booking) throw new AppError('Booking not found!', 404)
    if (booking.customer_id !== customerId) throw new AppError('You are not the customer of this booking', 403)
    if (booking.booking_status !== BookingStatus.COMPLETED) throw new AppError('Booking has not been completed', 400)

    const existingReview = await findReviewByBookingId(booking_id)
    if (existingReview) throw new AppError('Review for this booking already exists', 400)

    const provider = booking.provider_user_id
        ? await findProviderByUserId(booking.provider_user_id)
        : null

    return insertReview({
        customer_id: customerId,
        provider_user_id: provider?.user_id ?? booking.provider_user_id!,
        booking_id,
        comment,
        rating,
    })
}

export const listReviewsForActor = async (
    actor: { id: string; role: Role },
    query: QueryType & { customerId?: string; providerId?: string },
) => {
    const page = { limit: query.limit, page: query.page }
    if (actor.role === Role.CUSTOMER) return fetchReviews(page, actor.id)
    if (actor.role === Role.PROVIDER) return fetchReviews(page, undefined, actor.id)
    if (actor.role === Role.ADMIN) return fetchReviews(page, query.customerId, query.providerId)
    return []
}

export const getReviewByIdForActor = async (reviewId: string) => fetchReviewById(reviewId)
