import { z } from 'zod'

export const requestBookingParamsSchema = z.object({
    bookingId: z.uuid('Agendamento inválido'),
})

export const anamnesisNoteSchema = z.object({
    note: z.string({ error: 'Informe a nota' }).trim().min(1, 'Informe a nota').max(1000, 'A nota deve ter no máximo 1000 caracteres'),
}).strict()

export type AnamnesisNoteSchema = z.infer<typeof anamnesisNoteSchema>
