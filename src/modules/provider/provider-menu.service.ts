import { execute, sql, databaseError } from '../../shared/db/drizzle'
import { PoolClient } from 'pg'
import { CACHE_KEYS } from '../../constants'
import { deleteCache } from '../../shared/cache/cache'
import { withTransaction } from '../../shared/db/transaction'
import { AppError } from '../../shared/errors'
import { categoryExists } from '../catalog/category.service'
import { findServiceCategoryId } from '../catalog/service.service'
import { findProviderTypeLink } from '../professional-type/professional-type.service'
import { SaveMenuOffer } from './provider.schemas'
import { providerServices, providers } from './provider.table'

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

const mapDuplicate = (error: unknown): never => {
    const pg = databaseError(error)
    if (pg.code === '23505') {
        if (pg.constraint === 'provider_services_custom_name_idx') throw new AppError(DUPLICATE_NAME, 409)
        throw new AppError(DUPLICATE_SERVICE, 409)
    }
    throw error
}

export const readProviderMenu = async (providerId: string, client?: PoolClient): Promise<ProviderMenu> => {
    const offers = await execute(client, sql`
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
        FROM ${providerServices}
        LEFT JOIN services ON services.id = provider_services.service_id
        LEFT JOIN categories AS service_category ON service_category.id = services.category_id
        LEFT JOIN categories AS own_category ON own_category.id = provider_services.category_id
        LEFT JOIN professional_types ON professional_types.id = provider_services.professional_type_id
        WHERE provider_services.provider_id = ${providerId}
        ORDER BY lower(COALESCE(services.name, provider_services.custom_name)), provider_services.created_at
    `)
    const suggestions = await execute(client, sql`
        SELECT
            services.id AS service_id,
            services.name,
            services.description,
            services.category_id,
            categories.name AS category_name
        FROM services
        INNER JOIN categories ON categories.id = services.category_id
        WHERE NOT EXISTS (
            SELECT 1 FROM ${providerServices}
            WHERE provider_services.provider_id = ${providerId}
              AND provider_services.service_id = services.id
        )
        ORDER BY lower(services.name), services.name
    `)
    const types = await execute(client, sql`
        SELECT professional_types.id, professional_types.name
        FROM provider_professional_types
        INNER JOIN professional_types ON professional_types.id = provider_professional_types.professional_type_id
        WHERE provider_professional_types.provider_id = ${providerId}
          AND professional_types.is_active
        ORDER BY lower(professional_types.name), professional_types.name
    `)
    const categories = await execute(client, sql`SELECT id, name FROM categories ORDER BY lower(name), name`)

    return {
        offers: offers.rows.map(row => ({
            id: row.id as string,
            service_id: row.service_id as string | null,
            custom_name: row.custom_name as string | null,
            category_id: row.category_id as string | null,
            category_name: row.category_name as string | null,
            name: row.name as string,
            description: row.description as string | null,
            is_active: row.is_active as boolean,
            professional_type_id: row.professional_type_id as string | null,
            professional_type_name: row.professional_type_name as string | null,
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
        suggestions: suggestions.rows as ProviderMenu['suggestions'],
        types: types.rows as ProviderMenu['types'],
        categories: categories.rows as ProviderMenu['categories'],
    }
}

const assertType = async (client: PoolClient, providerId: string, typeId: string | null, active: boolean) => {
    if (!typeId) {
        if (active) throw new AppError(NEED_TYPE, 400)
        return
    }
    const type = await findProviderTypeLink(client, typeId, providerId)
    if (!type || !type.linked) throw new AppError(TYPE_NOT_CHOSEN, 400)
    if (!type.is_active) throw new AppError(TYPE_INACTIVE, 400)
}

const assertOffer = async (client: PoolClient, providerId: string, offer: SaveMenuOffer) => {
    const customName = offer.custom_name?.trim() || null
    const serviceId = offer.service_id ?? null
    if (customName && serviceId) throw new AppError(BOTH, 400)
    if (!customName && !serviceId) throw new AppError(NEED_NAME, 400)

    let categoryId = offer.category_id ?? null
    if (serviceId) {
        const service = await findServiceCategoryId(serviceId, client)
        if (!service) throw new AppError(INVALID_SERVICE, 400)
        categoryId = service.category_id
    } else if (!categoryId) {
        if (offer.is_active) throw new AppError(NEED_CATEGORY, 400)
    } else if (!await categoryExists(categoryId, client)) {
        throw new AppError(NEED_CATEGORY, 400)
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
    const existing = await execute<{ id: string, service_id: string | null }>(client, sql`
        SELECT ${providerServices.id} AS id, ${providerServices.service_id} AS service_id
        FROM ${providerServices}
        WHERE ${providerServices.provider_id} = ${providerId}
        FOR UPDATE
    `)
    const byId = new Map(existing.rows.map(row => [row.id, row.service_id]))
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
        try {
            if (offer.id) {
                await execute(client, sql`
                    UPDATE ${providerServices} SET
                        service_id = ${prepared.serviceId},
                        custom_name = ${prepared.customName},
                        category_id = ${prepared.categoryId},
                        professional_type_id = ${prepared.typeId},
                        description = ${prepared.description},
                        is_active = ${offer.is_active},
                        price = ${prepared.price},
                        price_small = ${prepared.prices[0]},
                        price_medium = ${prepared.prices[1]},
                        price_large = ${prepared.prices[2]},
                        duration_small_minutes = ${prepared.durations[0]},
                        duration_medium_minutes = ${prepared.durations[1]},
                        duration_large_minutes = ${prepared.durations[2]},
                        updated_at = NOW()
                    WHERE ${providerServices.id} = ${offer.id} AND ${providerServices.provider_id} = ${providerId}
                `)
            } else {
                await execute(client, sql`
                    INSERT INTO ${providerServices} (
                        provider_id, service_id, custom_name, category_id, professional_type_id,
                        description, is_active, price, price_small, price_medium, price_large,
                        duration_small_minutes, duration_medium_minutes, duration_large_minutes
                    ) VALUES (
                        ${providerId}, ${prepared.serviceId}, ${prepared.customName}, ${prepared.categoryId}, ${prepared.typeId},
                        ${prepared.description}, ${offer.is_active}, ${prepared.price},
                        ${prepared.prices[0]}, ${prepared.prices[1]}, ${prepared.prices[2]},
                        ${prepared.durations[0]}, ${prepared.durations[1]}, ${prepared.durations[2]}
                    )
                `)
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
        await execute(client, sql`SELECT ${providers.id} AS id FROM ${providers} WHERE ${providers.id} = ${providerId} FOR UPDATE`)
        return writeMenu(client, providerId, offers)
    })
    await Promise.all([...serviceIds].map(serviceId => deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(serviceId))))
    return readProviderMenu(providerId)
}
