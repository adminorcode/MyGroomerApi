import { z } from 'zod'
import { BookingStatus } from './booking.types'

const isCalendarDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const [year, month, day] = value.split('-').map(Number)
    const probe = new Date(Date.UTC(year!, month! - 1, day))
    return probe.getUTCFullYear() === year && probe.getUTCMonth() === month! - 1 && probe.getUTCDate() === day
}

export const bookingSlotsQuerySchema = z.object({
    provider_service_id: z.uuid('Serviço do groomer inválido'),
    pet_id: z.uuid('Selecione um pet'),
    date: z.string().refine(isCalendarDate, { message: 'Informe uma data válida no formato YYYY-MM-DD' }),
    reschedule_booking_id: z.uuid('Agendamento inválido').optional(),
}).strict()

export const rescheduleBookingSchema = z.object({
    scheduled_at: z.iso.datetime().refine(
        date => new Date(date) > new Date(),
        { message: 'A data deve estar no futuro' },
    ),
}).strict()

export const bookingIdSchema = z.object({
    id: z.uuid('Agendamento inválido'),
})

export const createBookingSchema = z.object({
    pet_id: z.uuid('Selecione um pet'),
    provider_service_id: z.uuid('Serviço do groomer inválido'),
    scheduled_at: z.iso.datetime().refine(
        date => new Date(date) > new Date(),
        { message: 'A data deve estar no futuro' },
    ),
    customer_location: z.string().min(1, 'O local é obrigatório'),
    customer_latitude: z.number().min(-90).max(90).optional(),
    customer_longitude: z.number().min(-180).max(180).optional(),
}).superRefine((data, ctx) => {
    const hasLatitude = data.customer_latitude !== undefined
    const hasLongitude = data.customer_longitude !== undefined
    if (hasLatitude !== hasLongitude) {
        ctx.addIssue({
            code: 'custom',
            path: ['customer_latitude'],
            message: 'Informe latitude e longitude juntas',
        })
    }
})

export const changeBookingStatusSchema = z.object({
    booking_status: z.enum(Object.values(BookingStatus) as [string, ...string[]]),
})

export type CreateBookingSchema = z.infer<typeof createBookingSchema>
export type ChangeBookingStatusSchema = z.infer<typeof changeBookingStatusSchema>
