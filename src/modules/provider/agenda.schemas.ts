import { z } from 'zod'

export const agendaBlockSchema = z.object({
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
}).strict().refine(value => new Date(value.ends_at) > new Date(value.starts_at), {
    message: 'O fim do bloqueio precisa ser depois do início.',
    path: ['ends_at'],
})

export const agendaBlockParamsSchema = z.object({ blockId: z.uuid() })
