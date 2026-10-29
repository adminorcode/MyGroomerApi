import { z } from 'zod'

export const createConversationSchema = z.object({
    provider_id: z.uuid('Groomer inválido'),
    booking_id: z.uuid('Agendamento inválido').optional(),
})

export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    cursor_id: z.uuid().optional(),
    cursor_time: z.coerce.date().optional(),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
})

export const conversationIdParamSchema = z.object({
    conversationId: z.uuid('Conversa inválida'),
})

export type CreateConversationSchema = z.infer<typeof createConversationSchema>
export type PaginationQuerySchema = z.infer<typeof paginationQuerySchema>
export type ConversationIdParamSchema = z.infer<typeof conversationIdParamSchema>
