import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { BookingStatus } from './booking.types'
import { BookingSlotInput } from './booking-slots.service'

export const getBookingSlots = async (req: Request, res: Response) => {
    const query = req.query as unknown as BookingSlotInput & { reschedule_booking_id?: string }
    const result = await listBookingSlotsForActor(req.user, query)
    res.json({ success: true, data: result })
}
import {
    changeBookingStatusForActor,
    createBookingForCustomer,
    getAuthorizedBooking,
    listBookingSlotsForActor,
    listBookingsForActor,
    rescheduleBookingForProvider,
} from './booking.service'
import { openConversationForProviderBooking } from '../conversation/conversation.service'

export const createBooking = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const result = await createBookingForCustomer(req.user, req.body)
    res.status(result.created ? 201 : 200).json({
        success: true,
        message: result.message,
        data: { created: result.created, booking: result.booking },
    })
}

export const getBookingId = async (req: Request, res: Response) => {
    const booking = await getAuthorizedBooking(req.user, req.params.id as string)
    res.status(200).json({ success: true, data: booking })
}

export const getBookings = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const result = await listBookingsForActor(req.user, req.query)
    res.status(200).json({ success: true, data: result })
}

export const changeBookingStatus = async (req: Request, res: Response) => {
    const { booking_status } = req.body as { booking_status?: BookingStatus }
    const updated = await changeBookingStatusForActor(req.user, req.params.id as string, booking_status)
    res.status(200).json({ success: true, data: updated })
}

export const rescheduleBooking = async (req: Request, res: Response) => {
    const { scheduled_at } = req.body as { scheduled_at?: string }
    const updated = await rescheduleBookingForProvider(req.user, req.params.id as string, scheduled_at)
    res.status(200).json({ success: true, data: updated })
}

export const openBookingConversation = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autenticado', 401)
    const result = await openConversationForProviderBooking(req.user.id, req.params.id as string)
    if (!result.created) {
        res.status(200).json({ success: true, message: 'A conversa já existe', data: result.conversation })
        return
    }
    res.status(201).json({ success: true, message: 'Conversa criada com sucesso', data: result.conversation })
}
