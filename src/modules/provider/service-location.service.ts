import { getPool } from '../../config/database.config'
import { AppError } from '../../shared/errors'
import { inBrazil, locateBaseAddress } from './base-geocoder'
import { SaveServiceLocationInput } from './provider.schemas'

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

const columns = `
    base_address, base_postal_code, base_complement, base_latitude, base_longitude,
    radius_km, travel_fee_mode, travel_fee_per_km
`

export const readServiceLocation = async (providerId: string): Promise<ServiceLocation> => {
    const pool = getPool()
    const result = await pool.query(
        `SELECT ${columns} FROM providers WHERE id = $1`,
        [providerId],
    )
    if (!result.rows[0]) throw new AppError('Perfil do groomer não encontrado', 404)
    return present(result.rows[0])
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
    const pool = getPool()
    const result = await pool.query(
        `UPDATE providers SET
            base_address = $2,
            base_postal_code = $3,
            base_complement = $4,
            base_latitude = $5,
            base_longitude = $6,
            radius_km = $7,
            travel_fee_mode = $8,
            travel_fee_per_km = $9
         WHERE id = $1
         RETURNING ${columns}`,
        [
            providerId,
            input.address.trim(),
            postalCode,
            complement,
            resolved.latitude,
            resolved.longitude,
            input.radius_km,
            input.travel_fee_mode,
            perKm,
        ],
    )
    if (!result.rows[0]) throw new AppError('Perfil do groomer não encontrado', 404)
    return present(result.rows[0])
}
