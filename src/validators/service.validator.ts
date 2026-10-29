import { z } from 'zod'

export const createServiceSchema = z.object({
    name: z.string().min(1, 'O nome do serviço é obrigatório'),
    image: z.string().optional(),
    description: z.string().optional(),
    category_id: z.uuid('Categoria inválida')
})

export const updateServiceSchema = createServiceSchema.partial().refine(
    (data) =>
        data.name !== undefined ||
        data.image !== undefined ||
        data.description !== undefined ||
        data.category_id !== undefined,
    { message: 'Informe pelo menos um campo' }
)

export type CreateServiceSchema = z.infer<typeof createServiceSchema>
export type UpdateServiceSchema = z.infer<typeof updateServiceSchema>
