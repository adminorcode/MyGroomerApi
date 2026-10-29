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
                message: 'Momo number is required for mobile money payout'
            })
        }
        if (!data.momo_provider) {
            ctx.addIssue({
                code: 'custom',
                path: ['momo_provider'],
                message: 'MoMo provider is required for mobile money payout'
            })
        }
    }

    if (data.payout_method === PayoutMethod.BANK) {
        if (!data.bank_account_number) {
            ctx.addIssue({
                code: 'custom',
                path: ['bank_account_number'],
                message: 'Bank account number is required for bank payout'
            })
        }
        if (!data.bank_account_name) {
            ctx.addIssue({
                code: 'custom',
                path: ['bank_account_name'],
                message: 'Bank account name is required for bank payout'
            })
        }
        if (!data.bank_code) {
            ctx.addIssue({
                code: 'custom',
                path: ['bank_code'],
                message: 'Bank code is required for bank payout'
            })
        }
    }
})


export const addProviderServiceSchema = z.object({
    service_id: z.uuid('Invalid service id'),
    price: z.number().positive()
})

export const updateProviderServiceSchema = z.object({
    price: z.number().positive()
}).strict()

