import { z } from 'zod'

export const createReviewSchema = z.object({
    booking_id: z.uuid('Agendamento inválido'),
    rating: z.number().min(1, 'A nota deve ser de 1 a 5').max(5, 'A nota deve ser de 1 a 5'),
    comment: z.string().trim().min(1, 'Informe um comentário'),
})

export const reviewIdSchema = z.object({
    reviewId: z.uuid('Avaliação inválida'),
})

export const listReviewsQuerySchema = z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    customerId: z.uuid('Tutor inválido').optional(),
    providerId: z.uuid('Profissional inválido').optional(),
})
