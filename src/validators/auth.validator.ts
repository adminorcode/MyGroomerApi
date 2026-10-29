import {z} from 'zod'
import { Role } from '../types/user.types'
import { MomoProvider, PayoutMethod } from '../types/provider.types'

export const registerAuthSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.email(),
    password: z.string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character"),
    role: z.enum([Role.CUSTOMER, Role.PROVIDER]),
    phone_number: z.string().optional(),
    address: z.string().optional(),
    profile_picture: z.string().optional(),
    payout_method: z.enum(Object.values(PayoutMethod) as [string, ...string[]]).optional(),
    momo_number: z.string().optional(),
    momo_provider: z.enum(Object.values(MomoProvider) as [string, ...string[]]).optional(),
    bank_account_number: z.string().optional(),
    bank_account_name: z.string().optional(),
    bank_code: z.string().optional(),
    id_document_url: z.string().optional(),
    service_area: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.role !== Role.PROVIDER) return

    if (!data.payout_method) {
        ctx.addIssue({ code: 'custom', path: ['payout_method'], message: 'Payout method is required' })
        return
    }

    if (data.payout_method === PayoutMethod.MOBILE_MONEY) {
        if (!data.momo_number) {
            ctx.addIssue({ code: 'custom', path: ['momo_number'], message: 'MoMo number required' })
        }
        if (!data.momo_provider) {
            ctx.addIssue({ code: 'custom', path: ['momo_provider'], message: 'MoMo provider required' })
        }
    }

    if (data.payout_method === PayoutMethod.BANK) {
        if (!data.bank_account_number) {
            ctx.addIssue({ code: 'custom', path: ['bank_account_number'], message: 'Account number required' })
        }
        if (!data.bank_account_name) {
            ctx.addIssue({ code: 'custom', path: ['bank_account_name'], message: 'Account name required' })
        }
    }

    if (!data.service_area) {
        ctx.addIssue({ code: 'custom', path: ['service_area'], message: 'Service area is required' })
    }
})


export const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(1, 'Password is required')
})


export const verifyEmailSchema = z.object({
    token: z.string()
})

export const forgotPasswordSchema = z.object({
    email: z.email()
})

export const resetPasswordSchema = z.object({
    token: z.string(),
    password: z.string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character")
})
