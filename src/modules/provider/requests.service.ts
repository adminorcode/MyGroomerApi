import { execute, sql } from '../../shared/db/drizzle'
import { providerServices } from './provider.table'
import { ProviderRequestsQuery } from './requests.schemas'

const TIMEZONE = 'America/Sao_Paulo'

const requestFilters = {
    pending: sql`b.booking_status = 'pending_confirmation'`,
    accepted: sql`b.booking_status = 'confirmed'`,
    rejected: sql`b.provider_rejected_at IS NOT NULL`,
    all: sql`(b.booking_status IN ('pending_confirmation', 'confirmed') OR b.provider_rejected_at IS NOT NULL)`,
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
    const offset = (query.page - 1) * query.limit
    const filter = requestFilters[query.group]
    const [rows, count] = await Promise.all([
        execute<RequestRow>(undefined, sql`
            SELECT
                b.id,
                CASE
                    WHEN b.provider_rejected_at IS NOT NULL THEN 'rejected'
                    WHEN b.booking_status = 'confirmed' THEN 'accepted'
                    ELSE 'pending'
                END AS "group",
                b.booking_status,
                pets.name AS pet_name,
                users.name AS customer_name,
                COALESCE(NULLIF(btrim(${providerServices.custom_name}), ''), services.name) AS service_name,
                b.scheduled_at,
                b.customer_location,
                COALESCE(b.service_price, ${providerServices.price}) AS price
             FROM bookings b
             JOIN ${providerServices} ON provider_services.id = b.provider_service_id
             LEFT JOIN services ON services.id = provider_services.service_id
             LEFT JOIN pets ON pets.id = b.pet_id
             LEFT JOIN users ON users.id = b.customer_id
             WHERE provider_services.provider_id = ${providerId}
               AND ${filter}
             ORDER BY b.scheduled_at ASC, b.id ASC
             LIMIT ${query.limit} OFFSET ${offset}
        `),
        execute<{ count: number }>(undefined, sql`
            SELECT COUNT(*)::int AS count
            FROM bookings b
            JOIN ${providerServices} ON provider_services.id = b.provider_service_id
            WHERE provider_services.provider_id = ${providerId}
              AND b.booking_status = 'pending_confirmation'
              AND (b.created_at AT TIME ZONE ${TIMEZONE})::date
                  = (NOW() AT TIME ZONE ${TIMEZONE})::date
        `),
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
