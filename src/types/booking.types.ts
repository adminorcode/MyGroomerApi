export enum BookingStatus {
    PENDING_PAYMENT = 'pending_payment',
    PENDING_CONFIRMATION = 'pending_confirmation',
    CONFIRMED = 'confirmed',
    CANCELLED = 'cancelled',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed'
}

export interface Booking{
    id:string
    customer_id:string
    pet_id?: string | null
    pet_name?: string | null
    pet_species?: string | null
    pet_breed?: string | null
    pet_size?: string | null
    pet_age_years?: number | null
    pet_notes?: string | null
    provider_service_id:string
    scheduled_at:Date
    booking_status: BookingStatus
    customer_location:string
    customer_latitude?: number
    customer_longitude?: number
    customer_name?:string
    customer_email?:string 
    price?:number
    service_name?:string
    provider_name?:string
    provider_user_id?:string
    created_at:Date
    updated_at:Date
}


export type CreateBookingInput = {
    customer_id:string
    pet_id:string
    provider_service_id:string
    scheduled_at:Date
    customer_location:string
    customer_latitude?: number
    customer_longitude?: number
}

export type UpdateBookingStatus = {
    booking_status: BookingStatus
}