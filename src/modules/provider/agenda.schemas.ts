import { z } from 'zod'
import { parseAgendaWindow } from './agenda.window'

export const agendaQuerySchema = z.object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
}).strict().superRefine((value, context) => {
    try {
        parseAgendaWindow(value.from, value.to)
    } catch (error) {
        context.addIssue({
            code: 'custom',
            message: error instanceof Error ? error.message : 'Janela inválida',
            path: ['to'],
        })
    }
})

export const agendaBlockSchema = z.object({
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
}).strict().refine(value => new Date(value.ends_at) > new Date(value.starts_at), {
    message: 'O fim do bloqueio precisa ser depois do início.',
    path: ['ends_at'],
})

export const agendaBlockParamsSchema = z.object({ blockId: z.uuid() })
