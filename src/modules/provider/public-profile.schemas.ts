import { z } from 'zod'

export const MAX_PUBLIC_PHOTO_BYTES = 10 * 1024 * 1024
export const MAX_GALLERY_PHOTOS = 5

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export const publicDescriptionSchema = z.object({
    attendance_rules: z.string().max(1000, 'A descrição deve ter no máximo 1000 caracteres.').nullable(),
}).strict()

export const publicPhotoSchema = z.object({
    name: z.string().trim().min(1).max(200),
    mime_type: z.enum(['image/jpeg', 'image/png'], { error: 'Aceitamos somente JPG e PNG.' }),
    size: z.number().int().min(1).max(MAX_PUBLIC_PHOTO_BYTES, 'Cada arquivo deve ter até 10 MB.'),
    base64: z.string().min(4).max(Math.ceil(MAX_PUBLIC_PHOTO_BYTES / 3) * 4),
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
        ? content.length >= 8 && content.subarray(0, 8).equals(pngSignature)
        : content.length >= 3 && content[0] === 255 && content[1] === 216 && content[2] === 255
    const extension = file.name.split('.').pop()?.toLowerCase()
    const validExtension = file.mime_type === 'image/jpeg'
        ? ['jpg', 'jpeg'].includes(extension ?? '')
        : extension === 'png'
    if (!validSignature || !validExtension) addError('O conteúdo não corresponde a um arquivo JPG ou PNG válido.')
})

export const galleryPhotoParamsSchema = z.object({
    photoId: z.uuid('Identificador inválido'),
}).strict()

export const publicPhotoParamsSchema = z.object({
    providerId: z.uuid('Identificador inválido'),
}).strict()

export type PublicPhotoInput = z.infer<typeof publicPhotoSchema>
export type PublicDescriptionInput = z.infer<typeof publicDescriptionSchema>
