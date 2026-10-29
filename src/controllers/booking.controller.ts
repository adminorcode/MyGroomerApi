import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import { BookingStatus, CreateBookingInput } from "../types/booking.types";
import { findBookingById, fetchBookings, updateBookingStatus, insertBooking, isBookingProvider } from "../services/booking.service";
import { Role } from "../types/user.types";
import { findPaymentByBookingId, insertPayment, updatePaymentStatus } from "../services/payment.service";
import { CreatePaymentInput, PaymentStatus } from "../types/payment.types";
import { initializePaystackPayment, refundPaystackPayment } from "../utils/paystack.utils";
import { findProviderServiceById } from "../services/provider.service";
import { CANCELLATION_FEE_RATE } from "../constants";
import { logger } from "../config/logger.config";
import { isLocalTestMode } from '../config/runtime.config';


export const createBooking = async (req:Request, res:Response) => {
    const user = req.user
    const {provider_service_id, scheduled_at, customer_location, customer_latitude, customer_longitude} = req.body

    if(!user){
        throw new AppError('Unauthorized', 401)
    }

    if (!provider_service_id || !scheduled_at || !customer_location){
        throw new AppError('Missing required fields: provider_service_id, scheduled_at, customer_location', 400)
    }

    const providerService = await findProviderServiceById(provider_service_id)
    
    if(!providerService){
        throw new AppError('Provider service not found!', 404)
    }
    
    const input:CreateBookingInput =  {
        customer_id: user.id,
        provider_service_id,
        scheduled_at,
        customer_location,
        customer_latitude,
        customer_longitude
    }

    const booking = await insertBooking(input, isLocalTestMode() ? BookingStatus.PENDING_CONFIRMATION : BookingStatus.PENDING_PAYMENT)
    if(!booking){
        throw new AppError('Failed to book service', 500)
    }

    if (isLocalTestMode()) {
        res.status(201).json({ success: true, message: 'Test booking created without payment', data: {
            booking, authorization_url: null, payment_mode: 'disabled'
        } })
        return
    }
    

    // generate paystack reference 
    const paystackReference = `boame_${booking.id}_${Date.now()}`
    const amount = providerService.price * 100

    const paystack_initialize = await initializePaystackPayment(
        user.email ?? '', 
        amount, 
        paystackReference,
        'https://boame.app/payment/callback'
    )


    const paymentInput:CreatePaymentInput = {
        customer_id: user.id,
        booking_id: booking.id,
        amount: providerService.price,
        payment_date: new Date(),
        paystack_reference:paystackReference
    }

    // create payment record
    const payment = await insertPayment(paymentInput)

    if(!payment){
        throw new AppError('Failed to make payment', 500)
    }

    res.status(201).json({
        success:true, 
        message:'Service booked successfully!', 
        data: {
            booking,
            authorization_url: paystack_initialize.data.authorization_url
    }
})
}


export const getBookingId = async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
        throw new AppError('Missing booking ID', 400);
    }

    const booking = await findBookingById(id as string);

    if (!booking) {
        throw new AppError('Booking not found', 404);
    }

    if (!req.user || (req.user.role !== Role.ADMIN && booking.customer_id !== req.user.id &&
        !await isBookingProvider(id as string, req.user.id))) {
        throw new AppError('You are not associated with this booking', 403)
    }

    res.status(200).json({ success: true, data: booking });
};

export const getBookings = async (req: Request, res: Response) => {
    const user = req.user
    const { page, limit, status, as } = req.query

    if (!user) throw new AppError('Unauthorized', 401)

    // determine filter based on who is asking
    let customer_id: string | undefined
    let provider_user_id: string | undefined

    if (as === 'provider') {
        provider_user_id = user.id  // show bookings where user is the provider
    } else {
        customer_id = user.id  // default: show bookings where user is the customer
    }

    // admin sees all
    if (user.role === Role.ADMIN) {
        customer_id = undefined
        provider_user_id = undefined
    }

    // status filter
    let statusEnum: BookingStatus | undefined
    if (status && Object.values(BookingStatus).includes(status as BookingStatus)) {
        statusEnum = status as BookingStatus
    }

    const result = await fetchBookings(
        { page: Number(page) || 1, limit: Number(limit) || 10 },
        customer_id,
        provider_user_id,
        statusEnum
    )

    res.status(200).json({ success: true, data: result })
}

export const changeBookingStatus = async (req: Request, res: Response) => {
    const user = req.user 
    const { id } = req.params;
    const { booking_status } = req.body;

    if (!user){
        throw new AppError('Unauthenticated!', 401)
    }

    if (!id) {
        throw new AppError('Missing booking ID', 400);
    }
    if (!booking_status || !Object.values(BookingStatus).includes(booking_status)) {
        throw new AppError('Invalid or missing booking status', 400);
    }

    const booking = await findBookingById(id as string)

    if(!booking){
        throw new AppError('Booking not found', 404)
    }

    // valid status transitions
    const validTransitions: Record<BookingStatus, BookingStatus[]> = {
        [BookingStatus.PENDING_PAYMENT]: [BookingStatus.CANCELLED],
        [BookingStatus.PENDING_CONFIRMATION]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
        [BookingStatus.CONFIRMED]: [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
        [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED],
        [BookingStatus.COMPLETED]: [],
        [BookingStatus.CANCELLED]: []
    }

    // check if the transition is valid
    const allowedNextStatuses = validTransitions[booking.booking_status]
    if (!allowedNextStatuses.includes(booking_status)){
        throw new AppError(
            `Cannot transition from ${booking.booking_status} to ${booking_status}`,
            400
        )
    }

    const isCustomer = booking.customer_id === user.id  // check if this is the user booking the service
    const isAdmin = user.role === Role.ADMIN
    const isProviderBooking = await isBookingProvider(id as string,user.id) // verify if this user is actually the provider of this booking

    // customer role can't update status to confirmed, inprogress or completed
    if(isCustomer && !isAdmin){
        if (
            booking_status === BookingStatus.CONFIRMED ||
            booking_status === BookingStatus.IN_PROGRESS ||
            booking_status === BookingStatus.COMPLETED
        ) {
            throw new AppError('Customers can only cancel bookings', 403)
        }
    }

    if (!isCustomer && !isAdmin) {

        if(!isProviderBooking){
            throw new AppError('You are not associated with this booking', 403)
        }
        
        if (booking_status === BookingStatus.PENDING_PAYMENT) {
            throw new AppError('Providers cannot set bookings back to pending', 403)
        }
    }

    if (booking_status === BookingStatus.CANCELLED && !isLocalTestMode()) {
        // check if payment exists and was successful
        const payment = await findPaymentByBookingId(booking.id)

        if (payment && payment.payment_status === PaymentStatus.SUCCESS) {

            // trigger Paystack refund => if provider cancelled=full_refund else deduct refund
            const deductable = payment.amount * CANCELLATION_FEE_RATE
            const baseAmount = Number(payment.amount) 
            let amount:number = 0

            const isBookingConfirmed = booking.booking_status === BookingStatus.CONFIRMED
            const isBookingPendingConfirm = booking.booking_status === BookingStatus.PENDING_CONFIRMATION

            if(isBookingConfirmed){
                amount = isCustomer ? (baseAmount - deductable)  : baseAmount
            }

            if (isBookingPendingConfirm){
                amount = baseAmount
            }

            const refund = await refundPaystackPayment(payment.paystack_reference, Math.round(amount * 100))
            logger.info('Refund initiated', { refund: refund.data }) // remove later

            if(!refund){
                throw new AppError('Refund was unsuccessful', 500)
            }

            // update payment status
           const update_payment_status =  await updatePaymentStatus(payment.paystack_reference, PaymentStatus.REFUNDED)

           if (!update_payment_status){
                throw new AppError('Payment status failed to update', 500)
           }
        } 

        if (payment && payment.payment_status === PaymentStatus.PENDING){
            await updatePaymentStatus(payment.paystack_reference, PaymentStatus.CANCELLED)
        }
    }

    const updated = await updateBookingStatus(id as string, { booking_status });

    if (!updated) {
        throw new AppError('Booking not found or update failed', 404);
    }

    res.status(200).json({ success: true, data: updated });
};
