import { Request, Response } from "express"
import { logger } from "../config/logger.config"
import { AppError } from "../middlewares/errorHandler"
import { findPaymentByBookingId, findPaymentByReference, insertPayment, updatePaymentStatus } from "../services/payment.service"
import { initializePaystackPayment, verifyPaystackPayment } from "../utils/paystack.utils"
import { CreatePaymentInput, PaymentStatus } from "../types/payment.types"
import { findBookingById, updateBookingStatus } from "../services/booking.service"
import crypto from 'crypto'
import { BookingStatus } from "../types/booking.types"
import { assertPaymentsEnabled } from '../config/runtime.config'


export const initializePayment = async (req:Request, res:Response) => {
    assertPaymentsEnabled()
    const {booking_id} = req.body
    
    if(!booking_id) {
        throw new AppError('Missing booking id', 400)
    }

    const result = await findBookingById(booking_id)

    if(!result){
        throw new AppError('No payment with this booking_id exists!', 404)
    }

    if(!result.customer_email || !result.customer_id || !result.price){
        throw new AppError('Missing required fields: customer_email, customer_id, price', 400)
    }

    const amount = result.price * 100 // converting to ghana pesewas
    
    // check if payment already exists
    const existingPayment = await findPaymentByBookingId(booking_id)
    
    if (existingPayment){
        return res.status(200).json(
            {
                success:true,
                message:'Payment already initiated',
                data:existingPayment
            }
        ) 
    }
    
    const paystack_reference = `boame_${booking_id}_${Date.now()}`

    const paystack_initialize = await initializePaystackPayment(
        result.customer_email, 
        amount, 
        paystack_reference,
        'https://boame.app/payment/callback'
    )

    const paymentInput:CreatePaymentInput = {
        customer_id: result.customer_id,
        booking_id,
        amount,
        payment_date: new Date(),
        paystack_reference
    }

    // create payment record
    await insertPayment(paymentInput)

    res.status(201).json({
        success:true,
        message:'Payment initiated',
        data: paystack_initialize.data.authorization_url
    })

}


export const webhookHandler = async (req:Request, res:Response)=>{
    assertPaymentsEnabled()
    const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(req.body)  // raw buffer, not parsed JSON
    .digest('hex')

    if (hash !== req.headers['x-paystack-signature']){
        throw new AppError('Invalid signature', 401)
    }

    const body = JSON.parse(req.body.toString())
    const event = body.event
    const data = body.data

    if (event === 'charge.success'){
        // verify paystack signature
        const paystackVerify = await verifyPaystackPayment(data.reference)
        if(paystackVerify.data.status !== 'success'){
            throw new AppError('Payment verification failed', 400)
        }
    
        // find payment by reference
        const payment = await findPaymentByReference(data.reference)
    
        if (!payment) {
            throw new AppError('No payment with this reference', 404)
        }
    
        // update payment status to success
        await updatePaymentStatus(data.reference, PaymentStatus.SUCCESS)

        logger.info(`Payment status updated to success: ${payment.payment_status}`)
     
        // update booking status to confirmed
        const updatedBooking = await updateBookingStatus(payment.booking_id, {booking_status: BookingStatus.PENDING_CONFIRMATION})
        logger.info(`Booking status updated to pending confirmation: ${updatedBooking?.booking_status}`)
    }


    if (event === 'charge.failed') {
        const payment = await findPaymentByReference(data.reference)
        if (payment) {
            await updatePaymentStatus(data.reference, PaymentStatus.FAILED)
        }
    }

    if (event === 'refund.processed') {
        // data.transaction_reference is the original payment reference
        logger.info('Refund processed', { transaction_reference: data.transaction_reference })
        // optionally notify the customer via push notification
    }

    res.status(200).json({received:true})
}
