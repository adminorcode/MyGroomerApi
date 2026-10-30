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

