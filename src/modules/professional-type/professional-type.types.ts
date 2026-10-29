export interface ProfessionalType {
    id: string
    name: string
    is_active: boolean
    created_at?: string
    updated_at?: string
}

export type CreateProfessionalTypeInput = {
    name: string
}

export type UpdateProfessionalTypeInput = {
    name?: string
    is_active?: boolean
}
