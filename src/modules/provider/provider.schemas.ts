import {z} from 'zod'
import { MomoProvider, PayoutMethod } from './provider.types'

export const registerProviderSchema = z.object({
    payout_method: z.enum(Object.values(PayoutMethod) as [string, ...string[]]),
    momo_number: z.string().optional(),
    momo_provider: z.enum(Object.values(MomoProvider) as [string, ...string[]]).optional(),
    bank_account_number: z.string().optional(),
    bank_account_name: z.string().optional(),
    bank_code: z.string().optional(),
    id_document_url: z.string().optional(),
    service_area: z.string().optional()
}).superRefine((data, ctx) => {
    if (data.payout_method === PayoutMethod.MOBILE_MONEY) {
        if (!data.momo_number) {
            ctx.addIssue({
                code: 'custom',
                path: ['momo_number'],
                message: 'O número do dinheiro móvel é obrigatório'
            })
        }
        if (!data.momo_provider) {
            ctx.addIssue({
                code: 'custom',
                path: ['momo_provider'],
                message: 'A operadora é obrigatória'
            })
        }
    }

    if (data.payout_method === PayoutMethod.BANK) {
        if (!data.bank_account_number) {
            ctx.addIssue({
                code: 'custom',
                path: ['bank_account_number'],
                message: 'O número da conta é obrigatório'
            })
        }
        if (!data.bank_account_name) {
            ctx.addIssue({
                code: 'custom',
                path: ['bank_account_name'],
                message: 'O nome da conta é obrigatório'
            })
        }
        if (!data.bank_code) {
            ctx.addIssue({
                code: 'custom',
                path: ['bank_code'],
                message: 'O código do banco é obrigatório'
            })
        }
    }
})


export const addProviderServiceSchema = z.object({
    service_id: z.uuid('Serviço inválido'),
    price: z.number().positive('O preço deve ser maior que zero')
})

export const updateProviderServiceSchema = z.object({
    price: z.number().positive('O preço deve ser maior que zero')
}).strict()

const blankToUndefined = (value: unknown) => value === '' || value === null || value === undefined ? undefined : value

export const coverageSearchSchema = z.object({
    address: z.preprocess(
        blankToUndefined,
        z.string({ error: 'Endereço do atendimento obrigatório' }).trim().min(3, 'Endereço do atendimento obrigatório').max(200, 'O endereço deve ter no máximo 200 caracteres'),
    ),
    service_id: z.preprocess(blankToUndefined, z.uuid('Serviço inválido').optional()),
    category_id: z.preprocess(blankToUndefined, z.uuid('Modalidade inválida').optional()),
    latitude: z.preprocess(blankToUndefined, z.coerce.number().min(-90).max(90).optional()),
    longitude: z.preprocess(blankToUndefined, z.coerce.number().min(-180).max(180).optional()),
}).superRefine((data, ctx) => {
    if (!data.service_id && !data.category_id) {
        ctx.addIssue({
            code: 'custom',
            path: ['service_id'],
            message: 'Selecione um serviço ou uma modalidade',
        })
    }
    const hasLatitude = data.latitude !== undefined
    const hasLongitude = data.longitude !== undefined
    if (hasLatitude !== hasLongitude) {
        ctx.addIssue({
            code: 'custom',
            path: ['latitude'],
            message: 'Informe latitude e longitude juntas',
        })
    }
})

export type CoverageSearchQuery = z.infer<typeof coverageSearchSchema>

const menuPrice = z.number().positive('O preço deve ser maior que zero').max(100000, 'O preço deve ser de no máximo 100000').nullable().optional()
const menuMinutes = z.number().int('A duração deve ser um número inteiro de minutos').min(1, 'A duração deve ser de pelo menos 1 minuto').max(600, 'A duração deve ser de no máximo 600 minutos').nullable().optional()

export const menuOfferSchema = z.object({
    id: z.uuid('Serviço inválido').optional(),
    service_id: z.uuid('Serviço inválido').nullable().optional(),
    custom_name: z.string().trim().max(80, 'O nome do serviço deve ter no máximo 80 caracteres').nullable().optional(),
    category_id: z.uuid('Categoria inválida').nullable().optional(),
    professional_type_id: z.uuid('Tipo de profissional inválido').nullable().optional(),
    description: z.string().trim().max(500, 'A descrição deve ter no máximo 500 caracteres').nullable().optional(),
    is_active: z.boolean(),
    prices: z.object({
        small: menuPrice,
        medium: menuPrice,
        large: menuPrice,
    }).partial().optional(),
    durations_minutes: z.object({
        small: menuMinutes,
        medium: menuMinutes,
        large: menuMinutes,
    }).partial().optional(),
}).strict()

export const saveMenuSchema = z.object({
    offers: z.array(menuOfferSchema).max(40, 'O cardápio aceita no máximo 40 serviços'),
}).strict()

export type SaveMenuOffer = z.infer<typeof menuOfferSchema>

const emptyToNull = (value: unknown) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

const postalCodeSchema = z.string({ error: 'Informe um CEP com 8 dígitos' })
    .trim()
    .transform(value => value.replace(/\D/g, ''))
    .refine(value => /^\d{8}$/.test(value), 'Informe um CEP com 8 dígitos')

const atMostTwoDecimals = (value: number) => Math.abs(value - Number(value.toFixed(2))) < 1e-9

export const servicePostalCodeSchema = z.object({
    postal_code: postalCodeSchema,
}).strict()

export const addressAutocompleteSchema = z.object({
    text: z.string({ error: 'Informe o endereço' }).trim().min(3, 'Informe pelo menos 3 caracteres').max(200, 'O endereço deve ter no máximo 200 caracteres'),
}).strict()

export const serviceLocationPreviewSchema = z.object({
    address: z.string({ error: 'Informe o endereço-base' }).trim().min(3, 'Informe o endereço-base').max(200, 'O endereço deve ter no máximo 200 caracteres'),
    postal_code: postalCodeSchema,
}).strict()

export const saveServiceLocationSchema = z.object({
    address: z.string({ error: 'Informe o endereço-base' }).trim().min(3, 'Informe o endereço-base').max(200, 'O endereço deve ter no máximo 200 caracteres'),
    postal_code: z.union([z.null(), postalCodeSchema]).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    complement: z.preprocess(
        emptyToNull,
        z.string().max(120, 'O complemento deve ter no máximo 120 caracteres').nullable().optional(),
    ),
    radius_km: z.union([z.literal(3), z.literal(5), z.literal(8), z.literal(10)], { error: 'Escolha um raio de 3, 5, 8 ou 10 km' }),
    travel_fee_mode: z.enum(['included', 'on_request', 'per_km'], { error: 'Escolha a taxa de deslocamento' }),
    travel_fee_per_km: z.number().positive('Informe o valor por quilômetro').max(100000, 'O valor por quilômetro deve ser de no máximo 100000').nullable().optional(),
}).strict().superRefine((data, ctx) => {
    const hasLatitude = data.latitude != null
    const hasLongitude = data.longitude != null
    if (hasLatitude !== hasLongitude) {
        ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Informe latitude e longitude juntas' })
    }
    if (!hasLatitude && !data.postal_code) {
        ctx.addIssue({ code: 'custom', path: ['postal_code'], message: 'Informe o endereço ou o CEP' })
    }
    if (data.travel_fee_mode === 'per_km') {
        if (data.travel_fee_per_km == null) {
            ctx.addIssue({ code: 'custom', path: ['travel_fee_per_km'], message: 'Informe o valor por quilômetro' })
        } else if (!atMostTwoDecimals(data.travel_fee_per_km)) {
            ctx.addIssue({ code: 'custom', path: ['travel_fee_per_km'], message: 'O valor por quilômetro deve ter no máximo duas casas decimais' })
        }
        return
    }
    if (data.travel_fee_per_km != null) {
        ctx.addIssue({ code: 'custom', path: ['travel_fee_per_km'], message: 'O valor por quilômetro só vale na faixa por km' })
    }
})

export type ServiceLocationPreviewQuery = z.infer<typeof serviceLocationPreviewSchema>
export type SaveServiceLocationInput = z.infer<typeof saveServiceLocationSchema>

