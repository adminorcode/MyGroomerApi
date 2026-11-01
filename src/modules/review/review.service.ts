import { SQL } from 'drizzle-orm'
import { logger } from '../../config/logger.config'
import { execute, sql } from '../../shared/db/drizzle'
import { findBookingById } from '../booking/booking.service'
import { findProviderByUserId } from '../provider/provider.service'
import { AppError } from '../../shared/errors'
import { QueryType } from '../../types/pagination.types'
import { BookingStatus } from '../booking/booking.types'
import { Role } from '../auth/user.types'
import { CreateReviewInput, Review } from './review.types'
import { reviews } from './review.table'

export const insertReview = async (reviewInput: CreateReviewInput): Promise<Review | null> => {
    try {
        const result = await execute<Review>(undefined, sql`
            INSERT INTO ${reviews} (customer_id, provider_user_id, booking_id, rating, comment)
            VALUES (
                ${reviewInput.customer_id},
                ${reviewInput.provider_user_id},
                ${reviewInput.booking_id},
                ${reviewInput.rating},
                ${reviewInput.comment}
            )
            RETURNING *
        `)
        return result.rows[0] || null
    } catch (error) {
        logger.error('insertReview error', { error })
        throw error
    }
}

export const findReviewByBookingId = async (bookingId: string): Promise<Review | null> => {
    try {
        const result = await execute<Review>(undefined, sql`
            SELECT * FROM ${reviews} WHERE ${reviews.booking_id} = ${bookingId}
        `)
        return result.rows[0] || null
    } catch (error) {
        logger.error('findReviewByBookingId error', { error })
        throw error
    }
}

export const fetchReviews = async (query: QueryType, customerId?: string, providerUserId?: string): Promise<Review[]> => {
    try {
        const conditions: SQL[] = []
        if (customerId) conditions.push(sql`${reviews.customer_id} = ${customerId}`)
        if (providerUserId) conditions.push(sql`${reviews.provider_user_id} = ${providerUserId}`)
        const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``
        const limit = query.limit || 10
        const page = query.page || 1
        const offset = (page - 1) * limit
        const result = await execute<Review>(undefined, sql`
            SELECT * FROM ${reviews}
            ${whereClause}
            ORDER BY ${reviews.created_at} DESC
            LIMIT ${limit} OFFSET ${offset}
        `)
        return result.rows
    } catch (error) {
        logger.error('fetchCustomerReviews error', { error })
        throw error
    }
}

export const fetchReviewById = async (reviewId: string) => {
    try {
        const result = await execute<Review>(undefined, sql`SELECT * FROM ${reviews} WHERE ${reviews.id} = ${reviewId}`)
        return result.rows[0]
    } catch (error) {
        logger.error('fetchReviewById error', { error })
        throw error
    }
}

export const createReviewForCustomer = async (
    customerId: string,
    body: { booking_id: string; rating: number; comment: string },
) => {
    const { booking_id, rating, comment } = body
    const booking = await findBookingById(booking_id)
    if (!booking) throw new AppError('Agendamento não encontrado', 404)
    if (booking.customer_id !== customerId) throw new AppError('Você não é o tutor deste agendamento', 403)
    if (booking.booking_status !== BookingStatus.COMPLETED) throw new AppError('O agendamento ainda não foi concluído', 400)
    const existingReview = await findReviewByBookingId(booking_id)
    if (existingReview) throw new AppError('Já existe uma avaliação para este agendamento', 400)
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
