import {z} from 'zod'


export const createReviewSchema = z.object({
    booking_id: z.uuid('Agendamento inválido'),
    rating: z.number().min(1, 'A nota deve ser de 1 a 5').max(5, 'A nota deve ser de 1 a 5'),
    comment: z.string().optional()
})

