import { z } from 'zod'

export const providerRequestsQuerySchema = z.object({
    group: z.enum(['pending', 'accepted', 'rejected', 'all']).optional().default('all'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
}).strict()

export type ProviderRequestsQuery = z.infer<typeof providerRequestsQuerySchema>
