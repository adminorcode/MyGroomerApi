import { randomUUID } from 'crypto'
import { PoolClient } from 'pg'
import { logger } from '../../config/logger.config'
import { isLocalTestMode } from '../../config/runtime.config'
import { CANCELLATION_FEE_RATE } from '../../constants'
import { getPaymentGateway } from '../../integrations/payments/payment-gateway'
import { findPetForOwner } from '../pet/pet.service'
import { findProviderServiceById } from '../provider/provider.service'
import { AppError } from '../../shared/errors'
import { withTransaction } from '../../shared/db/transaction'
import { Booking, BookingStatus, CreateBookingInput } from './booking.types'
import { PaymentStatus } from '../payment/payment.types'
import { Role } from '../auth/user.types'
import { applyPaymentStatus, findPaymentByBookingId, findPaymentByReference, insertPayment, updatePaymentStatus, withPaymentLock } from '../payment/payment.service'
import {
    fetchBookings,
    findBookingById,
    insertBooking,
    isBookingProvider,
    lockBookingStatus,
    moveBookingToPendingConfirmation,
    providerServiceHasBookings,
    updateBookingStatus,
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

export const createBookingForCustomer = async (actor: BookingActor, body: CreateBookingBody) => {
    const { pet_id, provider_service_id, scheduled_at, customer_location, customer_latitude, customer_longitude } = body
    if (!pet_id || !provider_service_id || !scheduled_at || !customer_location) {
        throw new AppError('Informe o pet, o serviço, a data e o local do atendimento', 400)
    }

    const pet = await findPetForOwner(pet_id, actor.id)
    if (!pet) throw new AppError('Pet não encontrado', 404)

    const providerService = await findProviderServiceById(provider_service_id)
    if (!providerService || providerService.is_active === false) {
        throw new AppError('Serviço do groomer não encontrado', 404)
    }

    const bookingId = randomUUID()
    const input: CreateBookingInput = {
        customer_id: actor.id,
        pet_id,
        provider_service_id,
        scheduled_at,
        customer_location,
        customer_latitude,
        customer_longitude,
    }

    if (isLocalTestMode()) {
        const prepared = await getPaymentGateway().initializePayment({
            email: actor.email ?? '',
            amountMinor: 0,
            reference: `local_${bookingId}`,
        })
        if (prepared.mode !== 'disabled' || prepared.authorizationUrl !== null) {
            throw new AppError('Payments are disabled in local test mode', 503)
        }
        const booking = await insertBooking(bookingId, input, BookingStatus.PENDING_CONFIRMATION)
        if (!booking) throw new AppError('Não foi possível criar o agendamento', 500)
        return {
            message: 'Agendamento de teste criado sem pagamento' as const,
            data: {
                booking,
                authorization_url: null,
                payment_mode: 'disabled' as const,
            },
        }
    }

    const reference = `boame_${bookingId}_${Date.now()}`
    const initialized = await getPaymentGateway().initializePayment({
        email: actor.email ?? '',
        amountMinor: amountMinor(providerService.price),
        reference,
        callbackUrl: 'https://boame.app/payment/callback',
    })
    if (!initialized.authorizationUrl) throw new AppError('Payment initialization failed!', 500)

    const booking = await withTransaction(async (client) => {
        const created = await insertBooking(bookingId, input, BookingStatus.PENDING_PAYMENT, client)
        if (!created) throw new AppError('Não foi possível criar o agendamento', 500)
        const payment = await insertPayment({
            customer_id: actor.id,
            booking_id: created.id,
            amount: providerService.price,
            payment_date: new Date(),
            paystack_reference: reference,
        }, client)
        if (!payment) throw new AppError('Não foi possível iniciar o pagamento', 500)
        return created
    })

    return {
        message: 'Serviço agendado com sucesso' as const,
        data: {
            booking,
            authorization_url: initialized.authorizationUrl,
        },
    }
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
        [BookingStatus.CONFIRMED]: [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
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

    const updated = await updateBookingStatus(bookingId, { booking_status: bookingStatus })
    if (!updated) throw new AppError('Agendamento não encontrado ou a atualização falhou', 404)
    return updated
}
