export interface Service {
    id: string
    name: string
    image?: string | null
    category_id?: string | null
    description?: string | null
    is_active: boolean
    created_at?: string
    updated_at?: string
}

export interface ServiceWithCategory extends Service {
    category_name?: string
    category_description?: string
}

export type CreateService = {
    name: string
    image?: string | null
    description?: string | null
    category_id: string
}

export type UpdateService = {
    name?: string
    image?: string | null
    description?: string | null
    category_id?: string
    is_active?: boolean
}
