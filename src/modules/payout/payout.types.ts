import { Booking } from '../booking/booking.types'

export enum TransactionType {
    PAYOUT = 'payout',
    PAYIN = 'payin',
    REFUND = 'refund',
}

export enum TransactionStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
}

export interface Transaction {
    id: string
    booking_id: string
    customer_user_id: string
    provider_user_id: string
    payment_id: string
    amount: number
    transaction_type: TransactionType
    transaction_status: TransactionStatus
    created_at: Date
    updated_at: Date
}

export type CreateTransaction = {
    booking_id: string
    customer_user_id: string
    provider_user_id: string
    payment_id: string
    amount: number
    transaction_type: TransactionType
    transaction_status: TransactionStatus
}

export type PayoutJobPayload = {
    booking_id: string
    provider_user_id: string
    amount: number
    payment_id: string
    customer_id: string
}

export type PayoutBookings = Booking & { provider_user_id: string; payment_amount: number; payment_id: string }

export type ProviderPayoutRow = Transaction & { service_name?: string; customer_name?: string }
