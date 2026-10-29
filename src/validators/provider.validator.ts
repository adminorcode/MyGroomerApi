import {z} from 'zod'
import { MomoProvider, PayoutMethod } from '../types/provider.types'

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

