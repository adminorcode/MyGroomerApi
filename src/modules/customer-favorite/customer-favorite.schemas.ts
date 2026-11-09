import { z } from 'zod'

export const favoriteProviderSchema = z.object({
    provider_id: z.uuid('Profissional inválido'),
}).strict()

export const favoriteProviderParamsSchema = z.object({
    providerId: z.uuid('Profissional inválido'),
})

export type FavoriteProviderBody = z.infer<typeof favoriteProviderSchema>
