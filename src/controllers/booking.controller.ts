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
import { isLocalTestMode } from '../config/runtime.config'
import { findPetForOwner } from '../services/pet.service';

const bookingStatusLabel: Record<BookingStatus, string> = {
    [BookingStatus.PENDING_PAYMENT]: 'pagamento pendente',
    [BookingStatus.PENDING_CONFIRMATION]: 'aguardando confirmação',
    [BookingStatus.CONFIRMED]: 'confirmado',
    [BookingStatus.IN_PROGRESS]: 'em andamento',
    [BookingStatus.COMPLETED]: 'concluído',
    [BookingStatus.CANCELLED]: 'cancelado',
}

export const createBooking = async (req:Request, res:Response) => {
    const user = req.user
    const {pet_id, provider_service_id, scheduled_at, customer_location, customer_latitude, customer_longitude} = req.body

    if(!user){
        throw new AppError('Não autorizado', 401)
    }

    if (!pet_id || !provider_service_id || !scheduled_at || !customer_location){
        throw new AppError('Informe o pet, o serviço, a data e o local do atendimento', 400)
    }

    const pet = await findPetForOwner(pet_id, user.id)
    if (!pet) {
        throw new AppError('Pet não encontrado', 404)
    }

    const providerService = await findProviderServiceById(provider_service_id)
    
    if(!providerService){
        throw new AppError('Serviço do groomer não encontrado', 404)
    }
    
    const input:CreateBookingInput =  {
        customer_id: user.id,
        pet_id,
        provider_service_id,
        scheduled_at,
        customer_location,
        customer_latitude,
        customer_longitude
    }

    const booking = await insertBooking(input, isLocalTestMode() ? BookingStatus.PENDING_CONFIRMATION : BookingStatus.PENDING_PAYMENT)
    if(!booking){
        throw new AppError('Não foi possível criar o agendamento', 500)
    }

    if (isLocalTestMode()) {
        res.status(201).json({ success: true, message: 'Agendamento de teste criado sem pagamento', data: {
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
        throw new AppError('Não foi possível iniciar o pagamento', 500)
    }

    res.status(201).json({
        success:true, 
        message:'Serviço agendado com sucesso', 
        data: {
            booking,
            authorization_url: paystack_initialize.data.authorization_url
    }
})
}


export const getBookingId = async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
        throw new AppError('Identificador do agendamento ausente', 400);
    }

    const booking = await findBookingById(id as string);

    if (!booking) {
        throw new AppError('Agendamento não encontrado', 404);
    }

    if (!req.user || (req.user.role !== Role.ADMIN && booking.customer_id !== req.user.id &&
        !await isBookingProvider(id as string, req.user.id))) {
        throw new AppError('Você não participa deste agendamento', 403)
    }

    res.status(200).json({ success: true, data: booking });
};

export const getBookings = async (req: Request, res: Response) => {
    const user = req.user
    const { page, limit, status, as } = req.query

    if (!user) throw new AppError('Não autorizado', 401)

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
        throw new AppError('Não autenticado', 401)
    }

    if (!id) {
        throw new AppError('Identificador do agendamento ausente', 400);
    }
    if (!booking_status || !Object.values(BookingStatus).includes(booking_status)) {
        throw new AppError('Status do agendamento inválido ou ausente', 400);
    }

    const booking = await findBookingById(id as string)

    if(!booking){
        throw new AppError('Agendamento não encontrado', 404)
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
            `Não é possível mudar de ${bookingStatusLabel[booking.booking_status]} para ${bookingStatusLabel[booking_status as BookingStatus]}.`,
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
            throw new AppError('Tutores só podem cancelar agendamentos', 403)
        }
    }

    if (!isCustomer && !isAdmin) {

        if(!isProviderBooking){
            throw new AppError('Você não participa deste agendamento', 403)
        }
        
        if (booking_status === BookingStatus.PENDING_PAYMENT) {
            throw new AppError('Groomers não podem voltar o agendamento para pendente', 403)
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
                throw new AppError('O reembolso não foi concluído', 500)
            }

            // update payment status
           const update_payment_status =  await updatePaymentStatus(payment.paystack_reference, PaymentStatus.REFUNDED)

           if (!update_payment_status){
                throw new AppError('Não foi possível atualizar o status do pagamento', 500)
           }
        } 

        if (payment && payment.payment_status === PaymentStatus.PENDING){
            await updatePaymentStatus(payment.paystack_reference, PaymentStatus.CANCELLED)
        }
    }

    const updated = await updateBookingStatus(id as string, { booking_status });

    if (!updated) {
        throw new AppError('Agendamento não encontrado ou a atualização falhou', 404);
    }

    res.status(200).json({ success: true, data: updated });
};
