export enum PaymentStatus {
    PENDING = 'pending',
    SUCCESS = 'success',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    REFUNDED = 'refunded'
}

export interface Payment {
    id:string
    customer_id:string
    booking_id:string
    amount:number
    payment_date:Date
    payment_status:PaymentStatus
    paystack_reference:string
    created_at:Date
    updated_at:Date
}

export type CreatePaymentInput = {
    customer_id:string
    booking_id:string
    amount:number
    payment_date:Date
    paystack_reference:string
}

