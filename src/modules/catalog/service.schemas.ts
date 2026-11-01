import { z } from 'zod'

export const createServiceSchema = z.object({
    name: z.string().min(1, 'O nome do serviço é obrigatório'),
    image: z.string().optional(),
    description: z.string().optional(),
    category_id: z.uuid('Categoria inválida'),
})

export const serviceIdSchema = z.object({
    serviceId: z.uuid('Serviço inválido'),
})

export const listServicesQuerySchema = z.object({
    categoryId: z.preprocess(
        value => value === '' ? undefined : value,
        z.uuid('Categoria inválida').optional(),
    ),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
})

export const updateServiceSchema = createServiceSchema.partial().refine(
    (data) =>
        data.name !== undefined ||
        data.image !== undefined ||
        data.description !== undefined ||
        data.category_id !== undefined,
    { message: 'Informe pelo menos um campo' },
)
