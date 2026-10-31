import { PoolClient } from 'pg'
import { CACHE_KEYS } from '../../constants'
import { deleteCache } from '../../shared/cache/cache'
import { executor, withTransaction } from '../../shared/db/transaction'
import { AppError } from '../../shared/errors'
import { SaveMenuOffer } from './provider.schemas'

const COMPLETE = 'Complete a descrição, o preço e a duração de cada porte antes de continuar.'
const NEED_TYPE = 'Escolha o tipo de cada serviço ativo antes de continuar.'
const TYPE_NOT_CHOSEN = 'Não é possível publicar serviço em um tipo que a conta não escolheu.'
const TYPE_INACTIVE = 'Não é possível publicar serviço em um tipo inativo.'
const NEED_NAME = 'Informe o nome do serviço.'
const NEED_CATEGORY = 'Escolha a categoria do serviço.'
const DUPLICATE_SERVICE = 'Você já oferece este serviço.'
const DUPLICATE_NAME = 'Já existe um serviço com esse nome.'
const NOT_FOUND = 'Serviço do groomer não encontrado.'
const INVALID_MONEY = 'Informe preços maiores que zero, com no máximo duas casas decimais.'
const INVALID_SERVICE = 'Serviço inválido.'
const BOTH = 'Informe um serviço do catálogo ou um nome novo, não os dois.'
const REPEATED = 'Serviço repetido no cardápio.'

export type MenuOffer = {
    id: string
    service_id: string | null
    custom_name: string | null
    category_id: string | null
    category_name: string | null
    name: string
    description: string | null
    is_active: boolean
    professional_type_id: string | null
    professional_type_name: string | null
    prices: { small: number | null, medium: number | null, large: number | null }
    durations_minutes: { small: number | null, medium: number | null, large: number | null }
}

export type ProviderMenu = {
    offers: MenuOffer[]
    suggestions: Array<{
        service_id: string
        name: string
        description: string | null
        category_id: string
        category_name: string
    }>
    types: Array<{ id: string, name: string }>
    categories: Array<{ id: string, name: string }>
}

const asNumber = (value: unknown): number | null => {
    if (value == null) return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

const hasTwoDecimals = (value: number) =>
    Number.isFinite(value) && Math.abs(Math.round(value * 100) - value * 100) < 1e-8

const pgError = (error: unknown) =>
    typeof error === 'object' && error !== null
        ? error as { code?: string, constraint?: string }
        : {}

const mapDuplicate = (error: unknown): never => {
    const pg = pgError(error)
    if (pg.code === '23505') {
        if (pg.constraint === 'provider_services_custom_name_idx') throw new AppError(DUPLICATE_NAME, 409)
        throw new AppError(DUPLICATE_SERVICE, 409)
    }
    throw error
}

export const readProviderMenu = async (providerId: string, client?: PoolClient): Promise<ProviderMenu> => {
    const db = executor(client)
    const offers = await db.query(
        `
        SELECT
            provider_services.id,
            provider_services.service_id,
            provider_services.custom_name,
            COALESCE(provider_services.category_id, services.category_id) AS category_id,
            COALESCE(own_category.name, service_category.name) AS category_name,
            COALESCE(services.name, provider_services.custom_name) AS name,
            provider_services.description,
            provider_services.is_active,
            provider_services.professional_type_id,
            professional_types.name AS professional_type_name,
            provider_services.price_small,
            provider_services.price_medium,
            provider_services.price_large,
            provider_services.duration_small_minutes,
            provider_services.duration_medium_minutes,
            provider_services.duration_large_minutes
        FROM provider_services
        LEFT JOIN services ON services.id = provider_services.service_id
        LEFT JOIN categories AS service_category ON service_category.id = services.category_id
        LEFT JOIN categories AS own_category ON own_category.id = provider_services.category_id
        LEFT JOIN professional_types ON professional_types.id = provider_services.professional_type_id
        WHERE provider_services.provider_id = $1
        ORDER BY lower(COALESCE(services.name, provider_services.custom_name)), provider_services.created_at
        `,
        [providerId],
    )
    const suggestions = await db.query(
        `
        SELECT
            services.id AS service_id,
            services.name,
            services.description,
            services.category_id,
            categories.name AS category_name
        FROM services
        INNER JOIN categories ON categories.id = services.category_id
        WHERE NOT EXISTS (
            SELECT 1 FROM provider_services
            WHERE provider_services.provider_id = $1
              AND provider_services.service_id = services.id
        )
        ORDER BY lower(services.name), services.name
        `,
        [providerId],
    )
    const types = await db.query(
        `
        SELECT professional_types.id, professional_types.name
        FROM provider_professional_types
        INNER JOIN professional_types ON professional_types.id = provider_professional_types.professional_type_id
        WHERE provider_professional_types.provider_id = $1
          AND professional_types.is_active
        ORDER BY lower(professional_types.name), professional_types.name
        `,
        [providerId],
    )
    const categories = await db.query(
        `SELECT id, name FROM categories ORDER BY lower(name), name`,
    )

    return {
        offers: offers.rows.map(row => ({
            id: row.id,
            service_id: row.service_id,
            custom_name: row.custom_name,
            category_id: row.category_id,
            category_name: row.category_name,
            name: row.name,
            description: row.description,
            is_active: row.is_active,
            professional_type_id: row.professional_type_id,
            professional_type_name: row.professional_type_name,
            prices: {
                small: asNumber(row.price_small),
                medium: asNumber(row.price_medium),
                large: asNumber(row.price_large),
            },
            durations_minutes: {
                small: asNumber(row.duration_small_minutes),
                medium: asNumber(row.duration_medium_minutes),
                large: asNumber(row.duration_large_minutes),
            },
        })),
        suggestions: suggestions.rows,
        types: types.rows,
        categories: categories.rows,
    }
}

const assertType = async (client: PoolClient, providerId: string, typeId: string | null, active: boolean) => {
    if (!typeId) {
        if (active) throw new AppError(NEED_TYPE, 400)
        return
    }
    const type = await client.query(
        `
        SELECT professional_types.is_active,
            EXISTS (
                SELECT 1 FROM provider_professional_types
                WHERE provider_id = $2 AND professional_type_id = professional_types.id
            ) AS linked
        FROM professional_types
        WHERE professional_types.id = $1
        `,
        [typeId, providerId],
    )
    if (!type.rowCount || !type.rows[0].linked) throw new AppError(TYPE_NOT_CHOSEN, 400)
    if (!type.rows[0].is_active) throw new AppError(TYPE_INACTIVE, 400)
}

const assertOffer = async (client: PoolClient, providerId: string, offer: SaveMenuOffer) => {
    const customName = offer.custom_name?.trim() || null
    const serviceId = offer.service_id ?? null
    if (customName && serviceId) throw new AppError(BOTH, 400)
    if (!customName && !serviceId) throw new AppError(NEED_NAME, 400)

    let categoryId = offer.category_id ?? null
    if (serviceId) {
        const service = await client.query(`SELECT id, category_id FROM services WHERE id = $1`, [serviceId])
        if (!service.rowCount) throw new AppError(INVALID_SERVICE, 400)
        categoryId = service.rows[0].category_id
    } else if (!categoryId) {
        if (offer.is_active) throw new AppError(NEED_CATEGORY, 400)
    } else {
        const category = await client.query(`SELECT id FROM categories WHERE id = $1`, [categoryId])
        if (!category.rowCount) throw new AppError(NEED_CATEGORY, 400)
    }

    await assertType(client, providerId, offer.professional_type_id ?? null, offer.is_active)

    const description = offer.description?.trim() || null
    const prices = [
        offer.prices?.small ?? null,
        offer.prices?.medium ?? null,
        offer.prices?.large ?? null,
    ]
    const durations = [
        offer.durations_minutes?.small ?? null,
        offer.durations_minutes?.medium ?? null,
        offer.durations_minutes?.large ?? null,
    ]
    for (const price of prices) {
        if (price != null && (price <= 0 || price > 100000 || !hasTwoDecimals(price))) {
            throw new AppError(INVALID_MONEY, 400)
        }
    }
    if (offer.is_active && (!description || prices.some(price => price == null) || durations.some(duration => duration == null))) {
        throw new AppError(COMPLETE, 400)
    }

    const priced = prices.filter((price): price is number => price != null && price > 0)
    return {
        customName,
        serviceId,
        categoryId,
        description,
        typeId: offer.professional_type_id ?? null,
        prices,
        durations,
        price: priced.length ? Math.min(...priced) : null,
    }
}

const writeMenu = async (client: PoolClient, providerId: string, offers: SaveMenuOffer[]) => {
    const existing = await client.query(
        `SELECT id, service_id FROM provider_services WHERE provider_id = $1 FOR UPDATE`,
        [providerId],
    )
    const byId = new Map(existing.rows.map(row => [row.id as string, row.service_id as string | null]))
    const seenIds = new Set<string>()
    const seenServices = new Set<string>()
    const seenNames = new Set<string>()
    const serviceIds = new Set<string>()

    for (const row of existing.rows) {
        if (row.service_id) serviceIds.add(row.service_id)
    }

    for (const offer of offers) {
        if (offer.id) {
            if (seenIds.has(offer.id) || !byId.has(offer.id)) {
                throw new AppError(seenIds.has(offer.id) ? REPEATED : NOT_FOUND, seenIds.has(offer.id) ? 400 : 404)
            }
            seenIds.add(offer.id)
            if ((byId.get(offer.id) ?? null) !== (offer.service_id ?? null)) throw new AppError(INVALID_SERVICE, 400)
        }
        if (offer.service_id) {
            if (seenServices.has(offer.service_id)) throw new AppError(DUPLICATE_SERVICE, 409)
            seenServices.add(offer.service_id)
            serviceIds.add(offer.service_id)
        }
        const name = offer.custom_name?.trim().toLocaleLowerCase('pt-BR')
        if (name) {
            if (seenNames.has(name)) throw new AppError(DUPLICATE_NAME, 409)
            seenNames.add(name)
        }

        const prepared = await assertOffer(client, providerId, offer)
        const values = [
            providerId,
            prepared.serviceId,
            prepared.customName,
            prepared.categoryId,
            prepared.typeId,
            prepared.description,
            offer.is_active,
            prepared.price,
            prepared.prices[0],
            prepared.prices[1],
            prepared.prices[2],
            prepared.durations[0],
            prepared.durations[1],
            prepared.durations[2],
        ]
        try {
            if (offer.id) {
                await client.query(
                    `
                    UPDATE provider_services SET
                        service_id = $2,
                        custom_name = $3,
                        category_id = $4,
                        professional_type_id = $5,
                        description = $6,
                        is_active = $7,
                        price = $8,
                        price_small = $9,
                        price_medium = $10,
                        price_large = $11,
                        duration_small_minutes = $12,
                        duration_medium_minutes = $13,
                        duration_large_minutes = $14,
                        updated_at = NOW()
                    WHERE id = $15 AND provider_id = $1
                    `,
                    [...values, offer.id],
                )
            } else {
                await client.query(
                    `
                    INSERT INTO provider_services (
                        provider_id, service_id, custom_name, category_id, professional_type_id,
                        description, is_active, price, price_small, price_medium, price_large,
                        duration_small_minutes, duration_medium_minutes, duration_large_minutes
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                    `,
                    values,
                )
            }
        } catch (error) {
            if (error instanceof AppError) throw error
            mapDuplicate(error)
        }
    }

    return serviceIds
}

export const saveProviderMenu = async (providerId: string, offers: SaveMenuOffer[]): Promise<ProviderMenu> => {
    const serviceIds = await withTransaction(async client => {
        await client.query('SELECT id FROM providers WHERE id = $1 FOR UPDATE', [providerId])
        return writeMenu(client, providerId, offers)
    })
    await Promise.all([...serviceIds].map(serviceId => deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(serviceId))))
    return readProviderMenu(providerId)
}
