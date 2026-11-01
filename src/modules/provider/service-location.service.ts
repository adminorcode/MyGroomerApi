import { AppError } from '../../shared/errors'
import { col, execute, sql } from '../../shared/db/drizzle'
import { inBrazil, locateBaseAddress } from './base-geocoder'
import { SaveServiceLocationInput } from './provider.schemas'
import { providers } from './provider.table'

export type RadiusKm = 3 | 5 | 8 | 10
export type TravelFeeMode = 'included' | 'on_request' | 'per_km'

export type ServiceLocation = {
    address: string | null
    postal_code: string | null
    complement: string | null
    latitude: number | null
    longitude: number | null
    label: string | null
    radius_km: RadiusKm | null
    travel_fee_mode: TravelFeeMode | null
    travel_fee_per_km: number | null
}

const radii = new Set<RadiusKm>([3, 5, 8, 10])
const feeModes = new Set<TravelFeeMode>(['included', 'on_request', 'per_km'])

const asRadius = (value: unknown): RadiusKm | null => {
    if (value == null) return null
    const radius = Number(value)
    return radii.has(radius as RadiusKm) ? radius as RadiusKm : null
}

const asFeeMode = (value: unknown): TravelFeeMode | null =>
    feeModes.has(value as TravelFeeMode) ? value as TravelFeeMode : null

const asMoney = (value: unknown): number | null => {
    if (value == null) return null
    const amount = Number(value)
    return Number.isFinite(amount) ? amount : null
}

const present = (row: {
    base_address: string | null
    base_postal_code: string | null
    base_complement: string | null
    base_latitude: string | number | null
    base_longitude: string | number | null
    radius_km: string | number | null
    travel_fee_mode: string | null
    travel_fee_per_km: string | number | null
}): ServiceLocation => {
    const address = row.base_address
    const postalCode = row.base_postal_code
    const latitude = row.base_latitude == null ? null : Number(row.base_latitude)
    const longitude = row.base_longitude == null ? null : Number(row.base_longitude)
    return {
        address,
        postal_code: postalCode,
        complement: row.base_complement,
        latitude,
        longitude,
        label: address && latitude != null && longitude != null ? address : null,
        radius_km: asRadius(row.radius_km),
        travel_fee_mode: asFeeMode(row.travel_fee_mode),
        travel_fee_per_km: asMoney(row.travel_fee_per_km),
    }
}

export const readServiceLocation = async (providerId: string): Promise<ServiceLocation> => {
    const result = await execute(undefined, sql`
        SELECT ${providers.base_address} AS base_address,
               ${providers.base_postal_code} AS base_postal_code,
               ${providers.base_complement} AS base_complement,
               ${providers.base_latitude} AS base_latitude,
               ${providers.base_longitude} AS base_longitude,
               ${providers.radius_km} AS radius_km,
               ${providers.travel_fee_mode} AS travel_fee_mode,
               ${providers.travel_fee_per_km} AS travel_fee_per_km
        FROM ${providers} WHERE ${providers.id} = ${providerId}
    `)
    if (!result.rows[0]) throw new AppError('Perfil do groomer não encontrado', 404)
    return present(result.rows[0] as Parameters<typeof present>[0])
}

export const writeServiceLocation = async (
    providerId: string,
    input: SaveServiceLocationInput,
): Promise<ServiceLocation> => {
    const postalCode = input.postal_code ?? null
    const pinned = input.latitude != null && input.longitude != null
        && inBrazil(input.latitude, input.longitude)
    const resolved = pinned
        ? { latitude: input.latitude as number, longitude: input.longitude as number, label: input.address.trim() }
        : postalCode
            ? await locateBaseAddress(input.address, postalCode)
            : null
    if (!resolved) throw new AppError('Não foi possível localizar este endereço.', 400)

    const complement = input.complement?.trim() ? input.complement.trim() : null
    const perKm = input.travel_fee_mode === 'per_km' ? input.travel_fee_per_km : null
    const result = await execute(undefined, sql`
        UPDATE ${providers} SET
            ${col(providers.base_address)} = ${input.address.trim()},
            ${col(providers.base_postal_code)} = ${postalCode},
            ${col(providers.base_complement)} = ${complement},
            ${col(providers.base_latitude)} = ${resolved.latitude},
            ${col(providers.base_longitude)} = ${resolved.longitude},
            ${col(providers.radius_km)} = ${input.radius_km},
            ${col(providers.travel_fee_mode)} = ${input.travel_fee_mode},
            ${col(providers.travel_fee_per_km)} = ${perKm}
         WHERE ${providers.id} = ${providerId}
         RETURNING base_address, base_postal_code, base_complement, base_latitude, base_longitude,
                   radius_km, travel_fee_mode, travel_fee_per_km
    `)
    if (!result.rows[0]) throw new AppError('Perfil do groomer não encontrado', 404)
    return present(result.rows[0] as Parameters<typeof present>[0])
}
