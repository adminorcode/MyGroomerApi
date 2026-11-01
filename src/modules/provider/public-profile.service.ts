import { randomUUID } from 'crypto'
import { AppError } from '../../shared/errors'
import { col, execute, sql } from '../../shared/db/drizzle'
import { withTransaction } from '../../shared/db/transaction'
import { minutesToClock } from './weekly-availability.slots'
import { PublicProfile, PublicProfileArea } from './provider.types'
import { MAX_GALLERY_PHOTOS, PublicDescriptionInput, PublicPhotoInput } from './public-profile.schemas'
import { providerGalleryPhotos, providerServices, providerWeekdays, providers } from './provider.table'

const radii = new Set([3, 5, 8, 10])

const asRadius = (value: unknown): PublicProfileArea['radius_km'] | null => {
    const radius = Number(value)
    return radii.has(radius) ? radius as PublicProfileArea['radius_km'] : null
}

const rulesOf = (value: unknown): string | null => {
    const rules = typeof value === 'string' ? value.trim() : ''
    return rules.length > 0 ? rules : null
}

export const presentPublicProfile = async (providerId: string): Promise<PublicProfile | null> => {
    const entry = await execute(undefined, sql`
        SELECT
            ${providers.id} AS id,
            ${providers.is_verified} AS is_verified,
            ${providers.attendance_rules} AS attendance_rules,
            ${providers.base_address} AS base_address,
            ${providers.radius_km} AS radius_km,
            ${providers.public_photo_id} AS public_photo_id,
            users.name,
            users.profile_picture,
            (
                SELECT COALESCE(ROUND(AVG(r.rating), 1), 0)
                FROM reviews r
                WHERE r.provider_user_id = ${providers.user_id}
            )::float AS average_rating,
            (
                SELECT COUNT(*)
                FROM reviews r
                WHERE r.provider_user_id = ${providers.user_id}
            )::int AS review_count
        FROM ${providers}
        INNER JOIN users ON users.id = ${providers.user_id}
        WHERE ${providers.id} = ${providerId}
    `)
    const row = entry.rows[0]
    if (!row) return null

    const services = await execute(undefined, sql`
        SELECT
            ${providerServices.id} AS id,
            COALESCE(NULLIF(btrim(${providerServices.custom_name}), ''), services.name) AS name,
            ${providerServices.price} AS price
        FROM ${providerServices}
        LEFT JOIN services ON services.id = ${providerServices.service_id}
        WHERE ${providerServices.provider_id} = ${providerId}
          AND ${providerServices.is_active}
          AND COALESCE(NULLIF(btrim(${providerServices.custom_name}), ''), services.name) IS NOT NULL
        ORDER BY name ASC, ${providerServices.id} ASC
    `)
    const days = await execute<{ weekday: number, start_minute: number, end_minute: number }>(undefined, sql`
        SELECT weekday, start_minute, end_minute
        FROM ${providerWeekdays}
        WHERE ${providerWeekdays.provider_id} = ${providerId}
        ORDER BY ${providerWeekdays.weekday} ASC
    `)
    const gallery = await execute<{ id: string }>(undefined, sql`
        SELECT ${providerGalleryPhotos.id} AS id
        FROM ${providerGalleryPhotos}
        WHERE ${providerGalleryPhotos.provider_id} = ${providerId}
        ORDER BY ${providerGalleryPhotos.created_at} ASC, ${providerGalleryPhotos.id} ASC
    `)

    const radius = asRadius(row.radius_km)
    const address = typeof row.base_address === 'string' ? row.base_address.trim() : ''

    return {
        provider_id: row.id as string,
        name: row.name as string,
        photo_url: (row.profile_picture as string | null) ?? null,
        photo_id: (row.public_photo_id as string | null) ?? null,
        is_verified: row.is_verified === true,
        average_rating: Number(row.average_rating) || 0,
        review_count: Number(row.review_count) || 0,
        attendance_rules: rulesOf(row.attendance_rules),
        area: radius != null && address.length > 0 ? { radius_km: radius, address } : null,
        schedule: days.rows.map(day => ({
            weekday: Number(day.weekday),
            start: minutesToClock(Number(day.start_minute)),
            end: minutesToClock(Number(day.end_minute)),
        })),
        gallery: gallery.rows.map(photo => ({ id: photo.id })),
        services: services.rows.flatMap(service => {
            const price = Number(service.price)
            if (!service.name || !Number.isFinite(price) || price <= 0) return []
            return [{ id: service.id as string, name: service.name as string, price }]
        }),
    }
}

export const readOwnPublicProfile = async (userId: string): Promise<PublicProfile> => {
    const provider = await execute<{ id: string }>(undefined, sql`
        SELECT ${providers.id} AS id FROM ${providers} WHERE ${providers.user_id} = ${userId}
    `)
    if (!provider.rows[0]) throw new AppError('Perfil do groomer não encontrado', 404)
    const profile = await presentPublicProfile(provider.rows[0].id)
    if (!profile) throw new AppError('Perfil do groomer não encontrado', 404)
    return profile
}

const ownProviderId = async (userId: string): Promise<string> => {
    const provider = await execute<{ id: string }>(undefined, sql`
        SELECT ${providers.id} AS id FROM ${providers} WHERE ${providers.user_id} = ${userId}
    `)
    if (!provider.rows[0]) throw new AppError('Perfil do groomer não encontrado', 404)
    return provider.rows[0].id
}

export const writePublicDescription = async (userId: string, input: PublicDescriptionInput): Promise<PublicProfile> => {
    const providerId = await ownProviderId(userId)
    const rules = rulesOf(input.attendance_rules)
    const saved = await execute(undefined, sql`
        UPDATE ${providers} SET ${col(providers.attendance_rules)} = ${rules} WHERE ${providers.id} = ${providerId} RETURNING id
    `)
    if (!saved.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
    return readOwnPublicProfile(userId)
}

const photoBytes = (input: PublicPhotoInput): Buffer => Buffer.from(input.base64, 'base64')

export const writePublicPhoto = async (userId: string, input: PublicPhotoInput): Promise<PublicProfile> => {
    const providerId = await ownProviderId(userId)
    const saved = await execute(undefined, sql`
        UPDATE ${providers}
        SET ${col(providers.public_photo)} = ${photoBytes(input)},
            ${col(providers.public_photo_mime)} = ${input.mime_type},
            ${col(providers.public_photo_id)} = ${randomUUID()}
        WHERE ${providers.id} = ${providerId}
        RETURNING id
    `)
    if (!saved.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
    return readOwnPublicProfile(userId)
}

export const clearPublicPhoto = async (userId: string): Promise<void> => {
    const providerId = await ownProviderId(userId)
    const saved = await execute(undefined, sql`
        UPDATE ${providers}
        SET ${col(providers.public_photo)} = NULL,
            ${col(providers.public_photo_mime)} = NULL,
            ${col(providers.public_photo_id)} = NULL
        WHERE ${providers.id} = ${providerId}
    `)
    if (!saved.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
}

export const addGalleryPhoto = async (userId: string, input: PublicPhotoInput): Promise<{ id: string }> => {
    const providerId = await ownProviderId(userId)
    return withTransaction(async client => {
        const locked = await execute(client, sql`
            SELECT ${providers.id} AS id FROM ${providers} WHERE ${providers.id} = ${providerId} FOR UPDATE
        `)
        if (!locked.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
        const count = await execute<{ total: number }>(client, sql`
            SELECT COUNT(*)::int AS total FROM ${providerGalleryPhotos}
            WHERE ${providerGalleryPhotos.provider_id} = ${providerId}
        `)
        if (count.rows[0].total >= MAX_GALLERY_PHOTOS) {
            throw new AppError('A galeria aceita no máximo 5 fotos.', 400)
        }
        const id = randomUUID()
        await execute(client, sql`
            INSERT INTO ${providerGalleryPhotos}(id, provider_id, mime_type, size, content)
            VALUES (${id}, ${providerId}, ${input.mime_type}, ${input.size}, ${photoBytes(input)})
        `)
        return { id }
    })
}

export const removeGalleryPhoto = async (userId: string, photoId: string): Promise<void> => {
    const providerId = await ownProviderId(userId)
    const removed = await execute(undefined, sql`
        DELETE FROM ${providerGalleryPhotos}
        WHERE ${providerGalleryPhotos.id} = ${photoId}
          AND ${providerGalleryPhotos.provider_id} = ${providerId}
        RETURNING id
    `)
    if (!removed.rowCount) throw new AppError('Foto não encontrada', 404)
}

const mediaVisible = async (providerId: string, requesterUserId: string): Promise<boolean> => {
    const row = await execute<{ user_id: string, has_active_service: boolean }>(undefined, sql`
        SELECT
            ${providers.user_id} AS user_id,
            EXISTS (
                SELECT 1 FROM ${providerServices}
                WHERE ${providerServices.provider_id} = ${providers.id}
                  AND ${providerServices.is_active}
            ) AS has_active_service
        FROM ${providers}
        WHERE ${providers.id} = ${providerId}
    `)
    const provider = row.rows[0]
    if (!provider) return false
    return provider.user_id === requesterUserId || provider.has_active_service === true
}

export const readGalleryPhoto = async (photoId: string, requesterUserId: string): Promise<{ mimeType: string, content: Buffer }> => {
    const row = await execute<{ provider_id: string, mime_type: string, content: Buffer }>(undefined, sql`
        SELECT provider_id, mime_type, content FROM ${providerGalleryPhotos} WHERE ${providerGalleryPhotos.id} = ${photoId}
    `)
    const photo = row.rows[0]
    if (!photo || !await mediaVisible(photo.provider_id, requesterUserId)) {
        throw new AppError('Foto não encontrada', 404)
    }
    return { mimeType: photo.mime_type, content: photo.content }
}

export const readPublicPhoto = async (providerId: string, requesterUserId: string): Promise<{ mimeType: string, content: Buffer }> => {
    const row = await execute<{ public_photo: Buffer | null, public_photo_mime: string }>(undefined, sql`
        SELECT ${providers.public_photo} AS public_photo, ${providers.public_photo_mime} AS public_photo_mime
        FROM ${providers}
        WHERE ${providers.id} = ${providerId}
    `)
    const photo = row.rows[0]
    if (!photo?.public_photo || !await mediaVisible(providerId, requesterUserId)) {
        throw new AppError('Foto não encontrada', 404)
    }
    return { mimeType: photo.public_photo_mime, content: photo.public_photo }
}
