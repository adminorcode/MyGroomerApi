import { z } from 'zod'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS = 5

export const validDocument = (value: string): boolean => {
    const digits = value.replace(/\D/g, '')
    if (!/^\d{11}$|^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false
    const calculate = (part: string, weights: number[]) => {
        const remainder = [...part].reduce((sum, digit, index) => sum + Number(digit) * weights[index]!, 0) % 11
        return remainder < 2 ? 0 : 11 - remainder
    }
    if (digits.length === 11) {
        return calculate(digits.slice(0, 9), [10,9,8,7,6,5,4,3,2]) === Number(digits[9]) &&
            calculate(digits.slice(0, 10), [11,10,9,8,7,6,5,4,3,2]) === Number(digits[10])
    }
    return calculate(digits.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]) === Number(digits[12]) &&
        calculate(digits.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]) === Number(digits[13])
}

export const validBrazilPhone = (value: string): boolean => {
    const digits = value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
    return /^[1-9]{2}(?:[2-5]\d{7}|9\d{8})$/.test(digits)
}

const attachmentMetadata = {
    name: z.string().trim().min(1).max(200),
    mime_type: z.enum(['image/jpeg', 'image/png', 'application/pdf'], { error: 'Aceitamos somente JPG, PNG e PDF.' }),
    size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES, 'Cada arquivo deve ter até 10 MB.'),
}

export const newAttachmentSchema = z.object({
    ...attachmentMetadata,
    base64: z.string().min(4).max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4),
}).strict().superRefine((file, context) => {
    const addError = (message: string) => context.addIssue({ code: 'custom', path: ['base64'], message })
    if (file.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)) {
        addError('O conteúdo do arquivo é inválido.')
        return
    }
    const content = Buffer.from(file.base64, 'base64')
    if (content.length !== file.size || content.toString('base64') !== file.base64) {
        addError('O tamanho e o conteúdo do arquivo não correspondem.')
        return
    }
    const validSignature = file.mime_type === 'image/png'
        ? content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : file.mime_type === 'image/jpeg'
            ? content.length >= 3 && content[0] === 255 && content[1] === 216 && content[2] === 255
            : content.subarray(0, 5).toString('ascii') === '%PDF-'
    const extension = file.name.split('.').pop()?.toLowerCase()
    const validExtension = file.mime_type === 'image/jpeg' ? ['jpg', 'jpeg'].includes(extension ?? '')
        : file.mime_type === 'image/png' ? extension === 'png' : extension === 'pdf'
    if (!validSignature || !validExtension) addError('O conteúdo não corresponde a um arquivo JPG, PNG ou PDF válido.')
})

const savedAttachmentSchema = z.object({ ...attachmentMetadata, id: z.uuid() }).strict()
export const attachmentSchema = z.union([newAttachmentSchema, savedAttachmentSchema])

export const registrationFields = {
    document: z.string().trim().max(18),
    experience: z.string().trim().max(500, 'A experiência deve ter até 500 caracteres.'),
    certifications: z.string().trim().max(500, 'As certificações devem ter até 500 caracteres.'),
    professional_type_ids: z.array(z.uuid('Tipo de profissional inválido.')).max(100).refine(ids => new Set(ids).size === ids.length, 'Não repita os tipos de profissional.'),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS, 'Anexe no máximo 5 arquivos.'),
}

type RegistrationRequired = { name: string, email: string, phone_number?: string, document: string, experience: string, certifications: string, professional_type_ids: string[] }
export const requireCompleteRegistration = (data: RegistrationRequired, ctx: z.RefinementCtx) => {
    const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [field], message })
    if (data.name.trim().split(/\s+/).filter(Boolean).length < 2) issue('name', 'Informe seu nome completo.')
    if (!validDocument(data.document)) issue('document', 'Informe um CPF ou CNPJ válido.')
    if (!validBrazilPhone(data.phone_number ?? '')) issue('phone_number', 'Informe um telefone brasileiro válido com DDD.')
    if (!z.email().safeParse(data.email).success) issue('email', 'Informe um e-mail válido.')
    if (!data.experience.trim()) issue('experience', 'Conte sua experiência profissional.')
    if (!data.certifications.trim()) issue('certifications', 'Informe suas certificações ou escreva que ainda não possui.')
    if (!data.professional_type_ids.length) issue('professional_type_ids', 'Escolha ao menos um tipo de profissional.')
}

export const registrationDetailsSchema = z.object(registrationFields).strict()
export const saveRegistrationSchema = z.object({
    name: z.string().trim().max(160),
    email: z.string().trim().max(254),
    phone_number: z.string().trim().max(30),
    ...registrationFields,
    mode: z.enum(['draft', 'continue']),
}).strict().superRefine((data, ctx) => {
    if (data.mode === 'continue') requireCompleteRegistration(data, ctx)
})

export type RegistrationDetails = z.infer<typeof registrationDetailsSchema>
export type SaveRegistrationInput = z.infer<typeof saveRegistrationSchema>
