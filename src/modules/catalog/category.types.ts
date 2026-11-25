export interface Category {
    id: string
    name: string
    description?: string | null
    is_active: boolean
    created_at?: string
    updated_at?: string
}

export type CreateCategory = {
    name: string
    description?: string | null
}

export type UpdateCategory = {
    name?: string
    description?: string | null
    is_active?: boolean
}
