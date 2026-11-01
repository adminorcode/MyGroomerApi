import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { BookingStatus } from './booking.types'
import { BookingSlotInput, listBookingSlots } from './booking-slots.service'

export const getBookingSlots = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const result = await listBookingSlots(req.user.id, req.query as unknown as BookingSlotInput)
    res.json({ success: true, data: result })
}
import {
    changeBookingStatusForActor,
    createBookingForCustomer,
    getAuthorizedBooking,
    listBookingsForActor,
} from './booking.service'

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
