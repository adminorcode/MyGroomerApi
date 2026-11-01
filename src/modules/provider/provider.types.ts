export type { RegistrationDetails } from './registration.schemas'

export enum PayoutMethod {
    MOBILE_MONEY = 'mobile_money',
    BANK = 'bank'
}

export enum MomoProvider {
    MTN = 'mtn',
    TELECEL = 'telecel',
    AIRTEL_TIGO = 'airtel_tigo'
}

export interface Provider {
    id: string
    user_id: string
    is_verified?: boolean | null
    payout_method: PayoutMethod
    momo_number?: string
    momo_provider?: MomoProvider
    bank_account_number?: string
    bank_account_name?: string
    bank_code?: string
    total_jobs_completed?: number
    id_document_url?: string
    service_area?: string
}

export type CreateProvider = {
    user_id: string
    payout_method?: PayoutMethod
    momo_number?: string
    momo_provider?: MomoProvider
    bank_account_number?: string
    bank_account_name?: string
    bank_code?: string
    id_document_url?: string
    service_area?: string
}

export interface ProviderService {
    id: string
    provider_id: string
    service_id: string
    price: number
    is_active?: boolean
    professional_type_id?: string | null
    price_small?: number | null
    price_medium?: number | null
    price_large?: number | null
    duration_small_minutes?: number | null
    duration_medium_minutes?: number | null
    duration_large_minutes?: number | null
    created_at?: string
    updated_at?: string
}

export type CreateProviderService = {
    provider_id: string
    service_id: string
    price?: number
}

export type CoverageProvider = {
    id: string
    provider_id: string
    service_id: string | null
    service_name: string
    name: string
    profile_picture?: string | null
    price: number
    average_rating: number
    review_count: number
    radius_km: number
    distance_km: number
}

export type PublicProfileService = {
    id: string
    name: string
    price: number
}

export type PublicProfileArea = {
    radius_km: 3 | 5 | 8 | 10
    address: string
}

export type PublicProfileDay = {
    weekday: number
    start: string
    end: string
}

export type PublicProfile = {
    provider_id: string
    name: string
    photo_url: string | null
    photo_id: string | null
    is_verified: boolean
    average_rating: number
    review_count: number
    attendance_rules: string | null
    area: PublicProfileArea | null
    schedule: PublicProfileDay[]
    gallery: { id: string }[]
    services: PublicProfileService[]
}
