export interface Review {
    id: string
    customer_id: string
    provider_user_id: string
    booking_id: string
    rating: number
    comment?: string
    created_at: Date
    updated_at: Date
}

export type CreateReviewInput = {
    customer_id: string
    provider_user_id: string
    booking_id: string
    rating: number
    comment?: string
}
