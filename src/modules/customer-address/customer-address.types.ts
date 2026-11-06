export const ADDRESS_LABELS = ['home', 'work', 'other'] as const

export type AddressLabel = (typeof ADDRESS_LABELS)[number]

export type CustomerAddress = {
    id: string
    label: AddressLabel
    address: string
    complement: string | null
    latitude: number
    longitude: number
    is_default: boolean
    created_at: Date
    updated_at: Date
}

export type CreateCustomerAddressInput = {
    label: AddressLabel
    address: string
    complement: string | null
    latitude: number
    longitude: number
    is_default?: boolean
}

export type UpdateCustomerAddressInput = {
    label?: AddressLabel
    address?: string
    complement?: string | null
    latitude?: number
    longitude?: number
    is_default?: boolean
}
