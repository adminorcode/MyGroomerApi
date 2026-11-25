import { z } from 'zod'

const serviceName = z.string({ error: 'Informe o nome do serviço' })
    .trim()
    .min(1, 'Informe o nome do serviço')

export const createServiceSchema = z.object({
    name: serviceName,
    image: z.string().trim().optional(),
    description: z.string().trim().optional(),
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
    include_inactive: z.enum(['true', 'false']).optional(),
})

export const updateServiceSchema = z.object({
    name: serviceName.optional(),
    image: z.string().trim().optional(),
    description: z.string().trim().optional(),
    category_id: z.uuid('Categoria inválida').optional(),
    is_active: z.boolean({ error: 'Informe se o serviço está ativo' }).optional(),
}).refine(
    (data) =>
        data.name !== undefined ||
        data.image !== undefined ||
        data.description !== undefined ||
        data.category_id !== undefined ||
        data.is_active !== undefined,
    { message: 'Informe pelo menos um campo' },
)
