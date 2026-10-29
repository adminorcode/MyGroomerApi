import {z} from 'zod'
import { BookingStatus } from '../types/booking.types'

export const createBookingSchema = z.object({
    pet_id: z.uuid('Selecione um pet'),
    provider_service_id: z.uuid('Serviço do groomer inválido'),
    scheduled_at: z.iso.datetime().refine(
        date => new Date(date) > new Date(),
        {message: 'A data deve estar no futuro'}
    ),
    customer_location: z.string().min(1,'O local é obrigatório'),
    customer_latitude: z.number().min(-90).max(90).optional(),
    customer_longitude: z.number().min(-180).max(180).optional()
})

export const changeBookingStatusSchema = z.object({
    booking_status: z.enum(Object.values(BookingStatus) as [string, ...string[]])
})

export type CreateBookingSchema = z.infer<typeof createBookingSchema>
export type ChangeBookingStatusSchema = z.infer<typeof changeBookingStatusSchema>