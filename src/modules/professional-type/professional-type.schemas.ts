import { z } from 'zod'

const professionalTypeName = z.string({ error: 'Informe o nome do tipo' })
    .trim()
    .min(1, 'Informe o nome do tipo')
    .max(80, 'O nome deve ter no máximo 80 caracteres')

export const createProfessionalTypeSchema = z.object({
    name: professionalTypeName,
})

export const updateProfessionalTypeSchema = z.object({
    name: professionalTypeName.optional(),
    is_active: z.boolean({ error: 'Informe se o tipo está ativo' }).optional(),
}).refine(
    (data) => data.name !== undefined || data.is_active !== undefined,
    { message: 'Informe o nome ou a situação do tipo' },
)

export const professionalTypeIdSchema = z.object({
    typeId: z.uuid('Tipo de profissional inválido'),
})

export const listProfessionalTypesQuerySchema = z.object({
    include_inactive: z.enum(['true', 'false']).optional(),
})

export type CreateProfessionalTypeSchema = z.infer<typeof createProfessionalTypeSchema>
export type UpdateProfessionalTypeSchema = z.infer<typeof updateProfessionalTypeSchema>
