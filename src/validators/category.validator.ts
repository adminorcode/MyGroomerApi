import { z } from 'zod'

export const createCategorySchema = z.object({
    name: z.string().min(1, 'O nome da categoria é obrigatório'),
    description: z.string().optional()
})

export const updateCategorySchema = createCategorySchema.partial().refine(
    (data) => data.name !== undefined || data.description !== undefined,
    { message: 'Informe pelo menos um campo' }
)

export type CreateCategorySchema = z.infer<typeof createCategorySchema>
export type UpdateCategorySchema = z.infer<typeof updateCategorySchema>
