import { PoolClient } from 'pg'
import { AppError } from '../../shared/errors'
import { withTransaction } from '../../shared/db/transaction'
import { lockProviderAgenda } from '../provider/agenda.service'
import { readWeeklySlots } from '../provider/weekly-availability.service'
import { saoPauloParts } from '../provider/weekly-availability.slots'
import { findProviderServiceById } from '../provider/provider.service'
import { findPetForOwner } from '../pet/pet.service'

export type BookingSlotInput = { provider_service_id: string, pet_id: string, date: string, exclude_booking_id?: string }

/** Acquires the provider lock before reading menu, pet and routine. */
export const prepareBookingSlots = async (ownerId: string, input: BookingSlotInput, client: PoolClient) => {
    const offerRef = await findProviderServiceById(input.provider_service_id, client)
    if (!offerRef) throw new AppError('Serviço do groomer não encontrado', 404)
    await lockProviderAgenda(offerRef.provider_id, client)
    const pet = await findPetForOwner(input.pet_id, ownerId, client, true)
    if (!pet) throw new AppError('Pet não encontrado', 404)
    const offer = await findProviderServiceById(input.provider_service_id, client, true)
    if (!offer || offer.provider_id !== offerRef.provider_id || offer.is_active === false) {
        throw new AppError('Serviço do groomer não encontrado', 404)
    }
    const size = pet.size
    const duration = Number(offer[`duration_${size}_minutes` as const])
    const priceValue = offer[`price_${size}` as const]
    const price = Number(priceValue)
    if (!Number.isInteger(duration) || duration <= 0 || duration > 600 || priceValue == null || !Number.isFinite(price) || price < 0) {
        throw new AppError('Este serviço não tem preço e duração disponíveis para o porte do pet.', 409)
    }
    const slots = (await readWeeklySlots(offer.provider_id, input.date, duration, client, input.exclude_booking_id))
        .filter(instant => new Date(instant).getTime() > Date.now())
    return { slots, duration_minutes: duration, price, timezone: 'America/Sao_Paulo' as const }
}

export const listBookingSlots = async (ownerId: string, input: BookingSlotInput) => (
    withTransaction(client => prepareBookingSlots(ownerId, input, client))
)

export const revalidateBookingSlot = async (
    ownerId: string,
    input: { pet_id: string, provider_service_id: string, scheduled_at: string, exclude_booking_id?: string },
    client: PoolClient,
) => {
    const instant = new Date(input.scheduled_at)
    const parts = saoPauloParts(instant)
    if (!parts) throw new AppError('Horário inválido.', 400)
    const prepared = await prepareBookingSlots(ownerId, { ...input, date: parts.date }, client)
    if (!prepared.slots.includes(instant.toISOString())) {
        throw new AppError('Este horário não está mais disponível. Escolha outro horário.', 409)
    }
    return prepared
}
