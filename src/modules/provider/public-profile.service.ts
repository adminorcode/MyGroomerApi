import { randomUUID } from 'crypto'
import { getPool } from '../../config/database.config'
import { AppError } from '../../shared/errors'
import { withTransaction } from '../../shared/db/transaction'
import { minutesToClock } from './weekly-availability.slots'
import { PublicProfile, PublicProfileArea } from './provider.types'
import { MAX_GALLERY_PHOTOS, PublicDescriptionInput, PublicPhotoInput } from './public-profile.schemas'

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
    const pool = getPool()
    const entry = await pool.query(
        `
        SELECT
            providers.id,
            providers.is_verified,
            providers.attendance_rules,
            providers.base_address,
            providers.radius_km,
            providers.public_photo_id,
            users.name,
            users.profile_picture,
            (
                SELECT COALESCE(ROUND(AVG(r.rating), 1), 0)
                FROM reviews r
                WHERE r.provider_user_id = providers.user_id
            )::float AS average_rating,
            (
                SELECT COUNT(*)
                FROM reviews r
                WHERE r.provider_user_id = providers.user_id
            )::int AS review_count
        FROM providers
        INNER JOIN users ON users.id = providers.user_id
        WHERE providers.id = $1
        `,
        [providerId],
    )
    const row = entry.rows[0]
    if (!row) return null

    const services = await pool.query(
        `
        SELECT
            provider_services.id,
            COALESCE(NULLIF(btrim(provider_services.custom_name), ''), services.name) AS name,
            provider_services.price
        FROM provider_services
        LEFT JOIN services ON services.id = provider_services.service_id
        WHERE provider_services.provider_id = $1
          AND provider_services.is_active
          AND COALESCE(NULLIF(btrim(provider_services.custom_name), ''), services.name) IS NOT NULL
        ORDER BY name ASC, provider_services.id ASC
        `,
        [providerId],
    )
    const days = await pool.query(
        `
        SELECT weekday, start_minute, end_minute
        FROM provider_weekdays
        WHERE provider_id = $1
        ORDER BY weekday ASC
        `,
        [providerId],
    )
    const gallery = await pool.query(
        `
        SELECT id
        FROM provider_gallery_photos
        WHERE provider_id = $1
        ORDER BY created_at ASC, id ASC
        `,
        [providerId],
    )

    const radius = asRadius(row.radius_km)
    const address = typeof row.base_address === 'string' ? row.base_address.trim() : ''

    return {
        provider_id: row.id,
        name: row.name,
        photo_url: row.profile_picture ?? null,
        photo_id: row.public_photo_id ?? null,
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
            return [{ id: service.id, name: service.name, price }]
        }),
    }
}

export const readOwnPublicProfile = async (userId: string): Promise<PublicProfile> => {
    const pool = getPool()
    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1', [userId])
    if (!provider.rows[0]) throw new AppError('Perfil do groomer não encontrado', 404)
    const profile = await presentPublicProfile(provider.rows[0].id)
    if (!profile) throw new AppError('Perfil do groomer não encontrado', 404)
    return profile
}

const ownProviderId = async (userId: string): Promise<string> => {
    const pool = getPool()
    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1', [userId])
    if (!provider.rows[0]) throw new AppError('Perfil do groomer não encontrado', 404)
    return provider.rows[0].id
}

export const writePublicDescription = async (userId: string, input: PublicDescriptionInput): Promise<PublicProfile> => {
    const providerId = await ownProviderId(userId)
    const rules = rulesOf(input.attendance_rules)
    const pool = getPool()
    const saved = await pool.query(
        'UPDATE providers SET attendance_rules = $2 WHERE id = $1 RETURNING id',
        [providerId, rules],
    )
    if (!saved.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
    return readOwnPublicProfile(userId)
}

const photoBytes = (input: PublicPhotoInput): Buffer => Buffer.from(input.base64, 'base64')

export const writePublicPhoto = async (userId: string, input: PublicPhotoInput): Promise<PublicProfile> => {
    const providerId = await ownProviderId(userId)
    const pool = getPool()
    const saved = await pool.query(
        `
        UPDATE providers
        SET public_photo = $2, public_photo_mime = $3, public_photo_id = $4
        WHERE id = $1
        RETURNING id
        `,
        [providerId, photoBytes(input), input.mime_type, randomUUID()],
    )
    if (!saved.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
    return readOwnPublicProfile(userId)
}

export const clearPublicPhoto = async (userId: string): Promise<void> => {
    const providerId = await ownProviderId(userId)
    const pool = getPool()
    const saved = await pool.query(
        `
        UPDATE providers
        SET public_photo = NULL, public_photo_mime = NULL, public_photo_id = NULL
        WHERE id = $1
        `,
        [providerId],
    )
    if (!saved.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
}

export const addGalleryPhoto = async (userId: string, input: PublicPhotoInput): Promise<{ id: string }> => {
    const providerId = await ownProviderId(userId)
    return withTransaction(async client => {
        const locked = await client.query('SELECT id FROM providers WHERE id = $1 FOR UPDATE', [providerId])
        if (!locked.rowCount) throw new AppError('Perfil do groomer não encontrado', 404)
        const count = await client.query(
            'SELECT COUNT(*)::int AS total FROM provider_gallery_photos WHERE provider_id = $1',
            [providerId],
        )
        if (count.rows[0].total >= MAX_GALLERY_PHOTOS) {
            throw new AppError('A galeria aceita no máximo 5 fotos.', 400)
        }
        const id = randomUUID()
        await client.query(
            `
            INSERT INTO provider_gallery_photos(id, provider_id, mime_type, size, content)
            VALUES ($1, $2, $3, $4, $5)
            `,
            [id, providerId, input.mime_type, input.size, photoBytes(input)],
        )
        return { id }
    })
}

export const removeGalleryPhoto = async (userId: string, photoId: string): Promise<void> => {
    const providerId = await ownProviderId(userId)
    const pool = getPool()
    const removed = await pool.query(
        'DELETE FROM provider_gallery_photos WHERE id = $1 AND provider_id = $2 RETURNING id',
        [photoId, providerId],
    )
    if (!removed.rowCount) throw new AppError('Foto não encontrada', 404)
}

const mediaVisible = async (providerId: string, requesterUserId: string): Promise<boolean> => {
    const pool = getPool()
    const row = await pool.query(
        `
        SELECT
            providers.user_id,
            EXISTS (
                SELECT 1 FROM provider_services
                WHERE provider_services.provider_id = providers.id
                  AND provider_services.is_active
            ) AS has_active_service
        FROM providers
        WHERE providers.id = $1
        `,
        [providerId],
    )
    const provider = row.rows[0]
    if (!provider) return false
    return provider.user_id === requesterUserId || provider.has_active_service === true
}

export const readGalleryPhoto = async (photoId: string, requesterUserId: string): Promise<{ mimeType: string, content: Buffer }> => {
    const pool = getPool()
    const row = await pool.query(
        'SELECT provider_id, mime_type, content FROM provider_gallery_photos WHERE id = $1',
        [photoId],
    )
    const photo = row.rows[0]
    if (!photo || !await mediaVisible(photo.provider_id, requesterUserId)) {
        throw new AppError('Foto não encontrada', 404)
    }
    return { mimeType: photo.mime_type, content: photo.content }
}

export const readPublicPhoto = async (providerId: string, requesterUserId: string): Promise<{ mimeType: string, content: Buffer }> => {
    const pool = getPool()
    const row = await pool.query(
        'SELECT public_photo, public_photo_mime FROM providers WHERE id = $1',
        [providerId],
    )
    const photo = row.rows[0]
    if (!photo?.public_photo || !await mediaVisible(providerId, requesterUserId)) {
        throw new AppError('Foto não encontrada', 404)
    }
    return { mimeType: photo.public_photo_mime, content: photo.public_photo }
}
