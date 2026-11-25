import { z } from 'zod'

const categoryName = z.string({ error: 'Informe o nome da categoria' })
    .trim()
    .min(1, 'Informe o nome da categoria')

const categoryDescription = z.string().trim().optional()

export const createCategorySchema = z.object({
    name: categoryName,
    description: categoryDescription,
})

export const updateCategorySchema = z.object({
    name: categoryName.optional(),
    description: categoryDescription,
    is_active: z.boolean({ error: 'Informe se a categoria está ativa' }).optional(),
}).refine(
    (data) => data.name !== undefined || data.description !== undefined || data.is_active !== undefined,
    { message: 'Informe pelo menos um campo' },
)

export const categoryIdSchema = z.object({
    categoryId: z.uuid('Categoria inválida'),
})

export const listCategoriesQuerySchema = z.object({
    include_inactive: z.enum(['true', 'false']).optional(),
})
