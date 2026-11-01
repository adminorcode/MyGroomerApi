import { executor } from '../../shared/db/transaction'
import { ProviderRequestsQuery } from './requests.schemas'

const TIMEZONE = 'America/Sao_Paulo'

const requestFilters = {
    pending: `b.booking_status = 'pending_confirmation'`,
    accepted: `b.booking_status = 'confirmed'`,
    rejected: `b.provider_rejected_at IS NOT NULL`,
    all: `(b.booking_status IN ('pending_confirmation', 'confirmed') OR b.provider_rejected_at IS NOT NULL)`,
} as const

type RequestRow = {
    id: string
    group: 'pending' | 'accepted' | 'rejected'
    booking_status: string
    pet_name: string | null
    customer_name: string | null
    service_name: string | null
    scheduled_at: Date | string
    customer_location: string | null
    price: string | number | null
}

const asNumberOrNull = (value: string | number | null): number | null => {
    if (value == null || value === '') return null
    const price = Number(value)
    return Number.isFinite(price) ? price : null
}

export const listProviderRequests = async (providerId: string, query: ProviderRequestsQuery) => {
    const db = executor()
    const offset = (query.page - 1) * query.limit
    const [rows, count] = await Promise.all([
        db.query<RequestRow>(
            `SELECT
                b.id,
                CASE
                    WHEN b.provider_rejected_at IS NOT NULL THEN 'rejected'
                    WHEN b.booking_status = 'confirmed' THEN 'accepted'
                    ELSE 'pending'
                END AS "group",
                b.booking_status,
                pets.name AS pet_name,
                users.name AS customer_name,
                COALESCE(NULLIF(btrim(provider_services.custom_name), ''), services.name) AS service_name,
                b.scheduled_at,
                b.customer_location,
                COALESCE(b.service_price, provider_services.price) AS price
             FROM bookings b
             JOIN provider_services ON provider_services.id = b.provider_service_id
             LEFT JOIN services ON services.id = provider_services.service_id
             LEFT JOIN pets ON pets.id = b.pet_id
             LEFT JOIN users ON users.id = b.customer_id
             WHERE provider_services.provider_id = $1
               AND ${requestFilters[query.group]}
             ORDER BY b.scheduled_at ASC, b.id ASC
             LIMIT $2 OFFSET $3`,
            [providerId, query.limit, offset],
        ),
        db.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count
             FROM bookings b
             JOIN provider_services ON provider_services.id = b.provider_service_id
             WHERE provider_services.provider_id = $1
               AND b.booking_status = 'pending_confirmation'
               AND (b.created_at AT TIME ZONE $2)::date
                   = (NOW() AT TIME ZONE $2)::date`,
            [providerId, TIMEZONE],
        ),
    ])

    return {
        timezone: TIMEZONE,
        group: query.group,
        page: query.page,
        limit: query.limit,
        pending_today_count: Number(count.rows[0]?.count ?? 0),
        requests: rows.rows.map(row => ({
            id: row.id,
            group: row.group,
            booking_status: row.booking_status,
            pet_name: row.pet_name,
            customer_name: row.customer_name,
            service_name: row.service_name,
            scheduled_at: new Date(row.scheduled_at).toISOString(),
            customer_location: row.customer_location,
            price: asNumberOrNull(row.price),
        })),
    }
}
