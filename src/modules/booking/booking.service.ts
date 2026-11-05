import { randomUUID } from 'crypto'
import { PoolClient } from 'pg'
import { logger } from '../../config/logger.config'
import { isLocalTestMode } from '../../config/runtime.config'
import { CANCELLATION_FEE_RATE } from '../../constants'
import { getPaymentGateway } from '../../integrations/payments/payment-gateway'
import { findProviderServiceById, findProviderUserId } from '../provider/provider.service'
import { lockProviderAgenda } from '../provider/agenda.service'
import { BookingSlotInput, listBookingSlots, prepareBookingSlots, revalidateBookingSlot } from './booking-slots.service'
import { AppError } from '../../shared/errors'
import { databaseError } from '../../shared/db/drizzle'
import { withTransaction } from '../../shared/db/transaction'
import { Booking, BookingStatus, CreateBookingInput } from './booking.types'
import { PaymentStatus } from '../payment/payment.types'
import { Role } from '../auth/user.types'
import { applyPaymentStatus, findPaymentByBookingId, findPaymentByReference, updatePaymentStatus, withPaymentLock } from '../payment/payment.service'
import {
    fetchBookings,
    findBookingById,
    findOpenBookingRequest,
    insertBooking,
    isBookingProvider,
    lockBookingStatus,
    moveBookingToPendingConfirmation,
    providerServiceHasBookings,
    updateBookingStatus,
    updateBookingSchedule,
} from './booking.repo'

export { findBookingById, lockBookingStatus }

export const hasBookingsForProviderService = async (providerServiceId: string): Promise<boolean> => {
    return providerServiceHasBookings(providerServiceId)
}

type BookingActor = {
    id: string
    role: Role
    email?: string
}

type CreateBookingBody = {
    pet_id?: string
    provider_service_id?: string
    scheduled_at?: string
    customer_location?: string
    customer_latitude?: number
    customer_longitude?: number
}

type BookingListQuery = {
    page?: unknown
    limit?: unknown
    status?: unknown
    as?: unknown
}

const bookingStatusLabel: Record<BookingStatus, string> = {
    [BookingStatus.PENDING_PAYMENT]: 'pagamento pendente',
    [BookingStatus.PENDING_CONFIRMATION]: 'aguardando confirmação',
    [BookingStatus.CONFIRMED]: 'confirmado',
    [BookingStatus.EN_ROUTE]: 'em deslocamento',
    [BookingStatus.IN_PROGRESS]: 'em andamento',
    [BookingStatus.COMPLETED]: 'concluído',
    [BookingStatus.CANCELLED]: 'cancelado',
}

const amountMinor = (amount: number) => Math.round(Number(amount) * 100)

const persistCancellation = async (bookingId: string, reference: string, paymentStatus: PaymentStatus) => {
    return withTransaction(async (client) => {
        const applied = await applyPaymentStatus(reference, paymentStatus, client)
        if (!applied) throw new AppError('Não foi possível atualizar o status do pagamento', 500)
        if (applied.rejected) {
            throw new AppError('O pagamento foi confirmado. Tente cancelar de novo para reembolsar.', 409)
        }
        const updated = await updateBookingStatus(bookingId, { booking_status: BookingStatus.CANCELLED }, client)
        if (!updated) throw new AppError('Agendamento não encontrado ou a atualização falhou', 404)
        return updated
    })
}

export const assertBookingParticipant = async (actor: BookingActor, bookingId: string, customerId: string) => {
    if (actor.role === Role.ADMIN || customerId === actor.id) return
    if (await isBookingProvider(bookingId, actor.id)) return
    throw new AppError('Você não participa deste agendamento', 403)
}

export const markAwaitingConfirmation = async (bookingId: string, client: PoolClient): Promise<Booking | null> => {
    return moveBookingToPendingConfirmation(bookingId, client)
}

const refundCapturedPayment = async (bookingId: string, reference: string, minor: number) => {
    return withPaymentLock(reference, async () => {
        const current = await findPaymentByReference(reference)
        if (!current) throw new AppError('Não foi possível atualizar o status do pagamento', 500)
        if (current.payment_status === PaymentStatus.REFUNDED || current.payment_status === PaymentStatus.CANCELLED) {
            const updated = await updateBookingStatus(bookingId, { booking_status: BookingStatus.CANCELLED })
            if (!updated) throw new AppError('Agendamento não encontrado ou a atualização falhou', 404)
            return updated
        }
        if (current.payment_status !== PaymentStatus.SUCCESS) {
            throw new AppError('O pagamento não pode ser reembolsado neste status', 409)
        }
        const refund = await getPaymentGateway().refundPayment(reference, minor)
        logger.info('Refund initiated', { accepted: refund.accepted })
        if (!refund.accepted) throw new AppError('O reembolso não foi concluído', 500)
        try {
            return await persistCancellation(bookingId, reference, PaymentStatus.REFUNDED)
        } catch (error) {
            logger.error('booking cancellation rolled back after gateway refund; saving payment as refunded', { error })
            await updatePaymentStatus(reference, PaymentStatus.REFUNDED).catch((persistError) => {
                logger.error('refunded payment status was not saved after gateway refund', { error: persistError })
            })
            throw error
        }
    })
}

const duplicateBookingResponse = (booking: Booking) => ({
    created: false as const,
    message: 'Esta solicitação já foi enviada' as const,
    booking,
})

const createdBookingResponse = (booking: Booking) => ({
    created: true as const,
    message: 'Solicitação enviada' as const,
    booking,
})

const isUniqueViolation = (error: unknown) => databaseError(error).code === '23505'

export const createBookingForCustomer = async (actor: BookingActor, body: CreateBookingBody) => {
    if (actor.role !== Role.CUSTOMER) {
        throw new AppError('Só o tutor pode enviar uma solicitação', 403)
    }
    const { pet_id, provider_service_id, scheduled_at, customer_location, customer_latitude, customer_longitude } = body
    if (!pet_id || !provider_service_id || !scheduled_at || !customer_location) {
        throw new AppError('Informe o pet, o serviço, a data e o local do atendimento', 400)
    }

    return withTransaction(async client => {
        const offerRef = await findProviderServiceById(provider_service_id, client)
        if (!offerRef) throw new AppError('Serviço do groomer não encontrado', 404)
        await lockProviderAgenda(offerRef.provider_id, client)
        const providerUserId = await findProviderUserId(offerRef.provider_id, client)
        if (!providerUserId) throw new AppError('Serviço do groomer não encontrado', 404)

        const existing = await findOpenBookingRequest(actor.id, pet_id, providerUserId, scheduled_at, client)
        if (existing) return duplicateBookingResponse(existing)

        const prepared = await revalidateBookingSlot(actor.id, { pet_id, provider_service_id, scheduled_at }, client)
        const bookingId = randomUUID()
        const input: CreateBookingInput = {
            customer_id: actor.id,
            pet_id,
            provider_service_id,
            scheduled_at,
            customer_location,
            customer_latitude,
            customer_longitude,
            duration_minutes: prepared.duration_minutes,
            service_price: prepared.price,
        }

        try {
            const inserted = await insertBooking(bookingId, input, BookingStatus.PENDING_CONFIRMATION, client)
            if (!inserted) throw new AppError('Não foi possível criar o agendamento', 500)
        } catch (error) {
            if (!isUniqueViolation(error)) throw error
            const raced = await findOpenBookingRequest(actor.id, pet_id, providerUserId, scheduled_at, client)
            if (!raced) throw error
            return duplicateBookingResponse(raced)
        }

        const booking = await findBookingById(bookingId, client)
        if (!booking) throw new AppError('Não foi possível criar o agendamento', 500)
        return createdBookingResponse(booking)
    })
}

export const getAuthorizedBooking = async (actor: BookingActor | undefined, bookingId: string | undefined) => {
    if (!bookingId) throw new AppError('Identificador do agendamento ausente', 400)
    const booking = await findBookingById(bookingId)
    if (!booking) throw new AppError('Agendamento não encontrado', 404)
    if (!actor || (actor.role !== Role.ADMIN && booking.customer_id !== actor.id && !await isBookingProvider(bookingId, actor.id))) {
        throw new AppError('Você não participa deste agendamento', 403)
    }
    return booking
}

export const listBookingsForActor = async (actor: BookingActor, query: BookingListQuery) => {
    let customerId: string | undefined
    let providerUserId: string | undefined

    if (query.as === 'provider') providerUserId = actor.id
    else customerId = actor.id

    if (actor.role === Role.ADMIN) {
        customerId = undefined
        providerUserId = undefined
    }

    const status = typeof query.status === 'string' ? query.status : undefined
    const statusEnum = status && Object.values(BookingStatus).includes(status as BookingStatus)
        ? status as BookingStatus
        : undefined

    return fetchBookings(
        { page: Number(query.page) || 1, limit: Number(query.limit) || 10 },
        customerId,
        providerUserId,
        statusEnum,
    )
}

export const changeBookingStatusForActor = async (
    actor: BookingActor | undefined,
    bookingId: string | undefined,
    bookingStatus: BookingStatus | undefined,
) => {
    if (!actor) throw new AppError('Não autenticado', 401)
    if (!bookingId) throw new AppError('Identificador do agendamento ausente', 400)
    if (!bookingStatus || !Object.values(BookingStatus).includes(bookingStatus)) {
        throw new AppError('Status do agendamento inválido ou ausente', 400)
    }

    const booking = await findBookingById(bookingId)
    if (!booking) throw new AppError('Agendamento não encontrado', 404)

    const validTransitions: Record<BookingStatus, BookingStatus[]> = {
        [BookingStatus.PENDING_PAYMENT]: [BookingStatus.CANCELLED],
        [BookingStatus.PENDING_CONFIRMATION]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
        [BookingStatus.CONFIRMED]: [BookingStatus.EN_ROUTE, BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
        [BookingStatus.EN_ROUTE]: [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
        [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED],
        [BookingStatus.COMPLETED]: [],
        [BookingStatus.CANCELLED]: [],
    }

    const allowedNextStatuses = validTransitions[booking.booking_status]
    if (!allowedNextStatuses.includes(bookingStatus)) {
        throw new AppError(
            `Não é possível mudar de ${bookingStatusLabel[booking.booking_status]} para ${bookingStatusLabel[bookingStatus]}.`,
            400,
        )
    }

    const isCustomer = booking.customer_id === actor.id
    const isAdmin = actor.role === Role.ADMIN
    const isProviderBooking = await isBookingProvider(bookingId, actor.id)

    if (isCustomer && !isAdmin) {
        if (
            bookingStatus === BookingStatus.CONFIRMED ||
            bookingStatus === BookingStatus.EN_ROUTE ||
            bookingStatus === BookingStatus.IN_PROGRESS ||
            bookingStatus === BookingStatus.COMPLETED
        ) {
            throw new AppError('Tutores só podem cancelar agendamentos', 403)
        }
    }

    if (!isCustomer && !isAdmin) {
        if (!isProviderBooking) throw new AppError('Você não participa deste agendamento', 403)
        if (bookingStatus === BookingStatus.PENDING_PAYMENT) {
            throw new AppError('Groomers não podem voltar o agendamento para pendente', 403)
        }
    }

    if (bookingStatus === BookingStatus.CANCELLED && !isLocalTestMode()) {
        const payment = await findPaymentByBookingId(booking.id)
        if (payment && payment.payment_status === PaymentStatus.SUCCESS) {
            const deductable = payment.amount * CANCELLATION_FEE_RATE
            const baseAmount = Number(payment.amount)
            let amount = 0
            const isBookingConfirmed = booking.booking_status === BookingStatus.CONFIRMED
            const isBookingPendingConfirm = booking.booking_status === BookingStatus.PENDING_CONFIRMATION
            if (isBookingConfirmed) amount = isCustomer ? (baseAmount - deductable) : baseAmount
            if (isBookingPendingConfirm) amount = baseAmount
            return refundCapturedPayment(bookingId, payment.paystack_reference, amountMinor(amount))
        }

        if (payment && payment.payment_status === PaymentStatus.PENDING) {
            return withPaymentLock(payment.paystack_reference, () => (
                persistCancellation(bookingId, payment.paystack_reference, PaymentStatus.CANCELLED)
            ))
        }
    }

    const providerRejectsPending = bookingStatus === BookingStatus.CANCELLED
        && booking.booking_status === BookingStatus.PENDING_CONFIRMATION
        && !isCustomer
        && !isAdmin
        && isProviderBooking
    const updated = await updateBookingStatus(
        bookingId,
        { booking_status: bookingStatus, mark_provider_rejected: providerRejectsPending },
        undefined,
        booking.booking_status,
    )
    if (!updated) throw new AppError('O agendamento foi alterado. Atualize os dados antes de tentar novamente.', 409)
    return updated
}

export const listBookingSlotsForActor = async (
    actor: BookingActor | undefined,
    query: BookingSlotInput & { reschedule_booking_id?: string },
) => {
    if (!actor) throw new AppError('Não autorizado', 401)
    if (query.reschedule_booking_id) {
        const booking = await findBookingById(query.reschedule_booking_id)
        if (!booking) throw new AppError('Agendamento não encontrado', 404)
        if (!await isBookingProvider(query.reschedule_booking_id, actor.id)) {
            throw new AppError('Só o profissional reagenda este atendimento.', 403)
        }
        if (!booking.pet_id) throw new AppError('Agendamento não encontrado', 404)
        if (query.pet_id !== booking.pet_id || query.provider_service_id !== booking.provider_service_id) {
            throw new AppError('Dados inválidos', 400)
        }
        return withTransaction(client => prepareBookingSlots(booking.customer_id, {
            provider_service_id: query.provider_service_id,
            pet_id: query.pet_id,
            date: query.date,
            exclude_booking_id: booking.id,
        }, client))
    }
    if (actor.role !== Role.CUSTOMER) throw new AppError('Só o tutor consulta horários desta forma', 403)
    return listBookingSlots(actor.id, query)
}

export const rescheduleBookingForProvider = async (
    actor: BookingActor | undefined,
    bookingId: string | undefined,
    scheduledAt: string | undefined,
) => {
    if (!actor) throw new AppError('Não autenticado', 401)
    if (!bookingId) throw new AppError('Identificador do agendamento ausente', 400)
    if (!scheduledAt) throw new AppError('Informe a nova data e horário', 400)
    if (new Date(scheduledAt) <= new Date()) {
        throw new AppError('A data deve estar no futuro', 400)
    }

    return withTransaction(async (client) => {
        const booking = await findBookingById(bookingId, client)
        if (!booking) throw new AppError('Agendamento não encontrado', 404)
        const isProvider = await isBookingProvider(bookingId, actor.id, client)
        if (booking.customer_id === actor.id) {
            throw new AppError('Só o profissional reagenda este atendimento.', 403)
        }
        if (!isProvider && actor.role !== Role.ADMIN) {
            throw new AppError('Você não participa deste agendamento', 403)
        }

        const offerRef = await findProviderServiceById(booking.provider_service_id, client)
        if (!offerRef) throw new AppError('Agendamento não encontrado', 404)
        await lockProviderAgenda(offerRef.provider_id, client)

        const currentStatus = await lockBookingStatus(bookingId, client)
        if (
            !currentStatus
            || (currentStatus !== BookingStatus.PENDING_CONFIRMATION && currentStatus !== BookingStatus.CONFIRMED)
        ) {
            throw new AppError('Este atendimento não pode ser reagendado.', 400)
        }
        if (!booking.pet_id) throw new AppError('Agendamento não encontrado', 404)

        const prepared = await revalidateBookingSlot(booking.customer_id, {
            pet_id: booking.pet_id,
            provider_service_id: booking.provider_service_id,
            scheduled_at: scheduledAt,
            exclude_booking_id: bookingId,
        }, client)

        const updated = await updateBookingSchedule(
            bookingId,
            scheduledAt,
            prepared.duration_minutes,
            client,
            [BookingStatus.PENDING_CONFIRMATION, BookingStatus.CONFIRMED],
        )
        if (!updated) {
            throw new AppError('O agendamento foi alterado. Atualize os dados antes de tentar novamente.', 409)
        }

        const detail = await findBookingById(bookingId, client)
        if (!detail) throw new AppError('Agendamento não encontrado', 404)
        return detail
    })
}
