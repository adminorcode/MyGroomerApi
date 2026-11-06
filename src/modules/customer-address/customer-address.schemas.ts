import { z } from 'zod'
import { ADDRESS_LABELS } from './customer-address.types'

const emptyToNull = (value: unknown) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

const labelSchema = z.enum(ADDRESS_LABELS, { error: 'Escolha casa, trabalho ou outros' })

const complementSchema = z.preprocess(
    emptyToNull,
    z.string().max(120, 'O complemento deve ter no máximo 120 caracteres').nullable().optional(),
)

const addressSchema = z.string({ error: 'Informe o endereço' })
    .trim()
    .min(3, 'Informe o endereço')
    .max(200, 'O endereço deve ter no máximo 200 caracteres')

export const createCustomerAddressSchema = z.object({
    label: labelSchema,
    address: addressSchema,
    complement: complementSchema,
    latitude: z.number({ error: 'Informe a latitude' }),
    longitude: z.number({ error: 'Informe a longitude' }),
    is_default: z.boolean().optional(),
}).strict()

export const updateCustomerAddressSchema = z.object({
    label: labelSchema.optional(),
    address: addressSchema.optional(),
    complement: complementSchema,
    latitude: z.number({ error: 'Informe a latitude' }).optional(),
    longitude: z.number({ error: 'Informe a longitude' }).optional(),
    is_default: z.boolean().optional(),
}).strict()

export const customerAddressIdSchema = z.object({
    id: z.uuid('Endereço inválido'),
})

export const deleteCustomerAddressQuerySchema = z.object({
    replacement_id: z.uuid('Endereço inválido').optional(),
}).strict()

export type CreateCustomerAddressSchema = z.infer<typeof createCustomerAddressSchema>
export type UpdateCustomerAddressSchema = z.infer<typeof updateCustomerAddressSchema>
