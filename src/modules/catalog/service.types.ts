export interface Service {
    id: string
    name: string
    image?: string
    category_id?: string
    description?: string
    created_at?: string
    updated_at?: string
}

export interface ServiceWithCategory extends Service {
    category_name?: string
    category_description?: string
}

export type CreateService = {
    name: string
    image?: string
    description?: string
    category_id: string
}
