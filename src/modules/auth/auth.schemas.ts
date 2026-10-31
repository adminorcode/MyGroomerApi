import {z} from 'zod'
import { Role } from './user.types'
import { MomoProvider, PayoutMethod } from '../provider/provider.types'
import { registrationDetailsSchema, requireCompleteRegistration } from '../provider/registration.schemas'

const e164Phone = /^\+[1-9]\d{6,14}$/

const requireCustomerPhone = (phone: string | undefined, ctx: z.RefinementCtx) => {
    if (!phone || !e164Phone.test(phone)) {
        ctx.addIssue({ code: 'custom', path: ['phone_number'], message: 'Informe um telefone válido' })
        return
    }
    const subscriberNumber = phone.replace(/^\+\d{1,3}/, '')
    if (subscriberNumber.startsWith('0')) {
        ctx.addIssue({ code: 'custom', path: ['phone_number'], message: 'O telefone não pode começar com 0 depois do código do país' })
    }
}

export const registerAuthSchema = z.object({
    name: z.string({ error: 'O nome é obrigatório' }).trim().min(1, 'O nome é obrigatório').max(160),
    email: z.email({ error: 'Informe um e-mail válido' }).max(254),
    password: z.string({ error: 'A senha deve ter pelo menos 8 caracteres' })
    .min(8, "A senha deve ter pelo menos 8 caracteres")
    .regex(/[A-Z]/, "A senha deve ter pelo menos uma letra maiúscula")
    .regex(/[a-z]/, "A senha deve ter pelo menos uma letra minúscula")
    .regex(/[0-9]/, "A senha deve ter pelo menos um número")
    .regex(/[^a-zA-Z0-9]/, "A senha deve ter pelo menos um caractere especial"),
    role: z.enum([Role.CUSTOMER, Role.PROVIDER]),
    phone_number: z.string().optional(),
    accepted_terms: z.boolean().optional(),
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
    registration: registrationDetailsSchema.optional(),
}).superRefine((data, ctx) => {
    if (data.role === Role.CUSTOMER) {
        requireCustomerPhone(data.phone_number, ctx)
        if (data.accepted_terms !== true) {
            ctx.addIssue({ code: 'custom', path: ['accepted_terms'], message: 'Aceite os termos e a política de privacidade' })
        }
        return
    }

    if (data.role !== Role.PROVIDER) return

    if (data.registration) {
        requireCompleteRegistration({ ...data.registration, name: data.name, email: data.email, phone_number: data.phone_number }, ctx)
        return
    }

    ctx.addIssue({ code: 'custom', path: ['registration'], message: 'Preencha os dados do cadastro profissional.' })
})


export const loginSchema = z.object({
    email: z.email({ error: 'Informe um e-mail válido' }),
    password: z.string({ error: 'A senha é obrigatória' }).min(1, 'A senha é obrigatória')
})


export const verifyEmailSchema = z.object({
    token: z.string()
})

export const forgotPasswordSchema = z.object({
    email: z.email({ error: 'Informe um e-mail válido' })
})

export const resetPasswordSchema = z.object({
    token: z.string(),
    password: z.string({ error: 'A senha deve ter pelo menos 8 caracteres' })
    .min(8, "A senha deve ter pelo menos 8 caracteres")
    .regex(/[A-Z]/, "A senha deve ter pelo menos uma letra maiúscula")
    .regex(/[a-z]/, "A senha deve ter pelo menos uma letra minúscula")
    .regex(/[0-9]/, "A senha deve ter pelo menos um número")
    .regex(/[^a-zA-Z0-9]/, "A senha deve ter pelo menos um caractere especial")
})
