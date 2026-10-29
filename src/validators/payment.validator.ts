import {z} from 'zod'

export const initializePaymentSchema = z.object({
    booking_id: z.uuid('Agendamento inválido')
})
