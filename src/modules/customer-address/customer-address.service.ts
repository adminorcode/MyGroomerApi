import { col, execute, sql } from '../../shared/db/drizzle'
import { withTransaction } from '../../shared/db/transaction'
import { AppError } from '../../shared/errors'
import { inBrazil } from '../provider/base-geocoder'
import { customerAddresses } from './customer-address.table'
import {
    AddressLabel,
    CreateCustomerAddressInput,
    CustomerAddress,
    UpdateCustomerAddressInput,
} from './customer-address.types'

type AddressRow = {
    id: string
    label: AddressLabel
    address: string
    complement: string | null
    latitude: string | number
    longitude: string | number
    is_default: boolean
    created_at: Date
    updated_at: Date
}

const outsideBrazil = () => new AppError('O endereço precisa estar no Brasil.', 400)
const chooseReplacement = () => new AppError('Escolha outro endereço padrão.', 400)

const toAddress = (row: AddressRow): CustomerAddress => ({
    id: row.id,
    label: row.label,
    address: row.address,
    complement: row.complement,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    is_default: row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
})

const assertInBrazil = (latitude: number, longitude: number) => {
    if (!inBrazil(latitude, longitude)) throw outsideBrazil()
}

export const listCustomerAddresses = async (customerId: string): Promise<CustomerAddress[]> => {
    const result = await execute<AddressRow>(undefined, sql`
        SELECT * FROM ${customerAddresses}
        WHERE ${customerAddresses.customer_id} = ${customerId}
        ORDER BY ${customerAddresses.is_default} DESC, ${customerAddresses.created_at} ASC
    `)
    return result.rows.map(toAddress)
}

const findOwned = async (client: Parameters<typeof execute>[0], id: string, customerId: string) => {
    const result = await execute<AddressRow>(client, sql`
        SELECT * FROM ${customerAddresses}
        WHERE ${customerAddresses.id} = ${id} AND ${customerAddresses.customer_id} = ${customerId}
    `)
    return result.rows[0] ? toAddress(result.rows[0]) : null
}

const clearDefault = async (client: Parameters<typeof execute>[0], customerId: string) => {
    await execute(client, sql`
        UPDATE ${customerAddresses}
        SET ${col(customerAddresses.is_default)} = false
        WHERE ${customerAddresses.customer_id} = ${customerId} AND ${customerAddresses.is_default}
    `)
}

export const insertCustomerAddress = async (customerId: string, input: CreateCustomerAddressInput) => {
    assertInBrazil(input.latitude, input.longitude)
    return withTransaction(async client => {
        const existing = await execute<{ total: number }>(client, sql`
            SELECT COUNT(*)::int AS total FROM ${customerAddresses}
            WHERE ${customerAddresses.customer_id} = ${customerId}
        `)
        const total = Number(existing.rows[0]?.total ?? 0)
        const makeDefault = total === 0 || input.is_default === true
        if (makeDefault && total > 0) await clearDefault(client, customerId)
        const result = await execute<AddressRow>(client, sql`
            INSERT INTO ${customerAddresses} (
                customer_id, label, address, complement, latitude, longitude, is_default
            )
            VALUES (
                ${customerId}, ${input.label}, ${input.address}, ${input.complement},
                ${input.latitude}, ${input.longitude}, ${makeDefault}
            )
            RETURNING *
        `)
        return toAddress(result.rows[0])
    })
}

export const updateCustomerAddress = async (id: string, customerId: string, input: UpdateCustomerAddressInput) => {
    const changingPoint = input.address !== undefined || input.latitude !== undefined || input.longitude !== undefined
    if (changingPoint && (input.address === undefined || input.latitude === undefined || input.longitude === undefined)) {
        throw new AppError('Ao trocar o endereço, informe o texto, a latitude e a longitude.', 400)
    }
    if (input.latitude !== undefined && input.longitude !== undefined) {
        assertInBrazil(input.latitude, input.longitude)
    }
    return withTransaction(async client => {
        const current = await findOwned(client, id, customerId)
        if (!current) return null
        if (input.is_default === false && current.is_default) {
            const others = await execute<{ total: number }>(client, sql`
                SELECT COUNT(*)::int AS total FROM ${customerAddresses}
                WHERE ${customerAddresses.customer_id} = ${customerId} AND ${customerAddresses.id} <> ${id}
            `)
            if (Number(others.rows[0]?.total ?? 0) > 0) throw chooseReplacement()
        }
        if (input.is_default === true && !current.is_default) await clearDefault(client, customerId)
        const result = await execute<AddressRow>(client, sql`
            UPDATE ${customerAddresses}
            SET ${col(customerAddresses.label)} = ${input.label ?? current.label},
                ${col(customerAddresses.address)} = ${input.address ?? current.address},
                ${col(customerAddresses.complement)} = ${input.complement !== undefined ? input.complement : current.complement},
                ${col(customerAddresses.latitude)} = ${input.latitude ?? current.latitude},
                ${col(customerAddresses.longitude)} = ${input.longitude ?? current.longitude},
                ${col(customerAddresses.is_default)} = ${input.is_default === true ? true : current.is_default},
                ${col(customerAddresses.updated_at)} = NOW()
            WHERE ${customerAddresses.id} = ${id} AND ${customerAddresses.customer_id} = ${customerId}
            RETURNING *
        `)
        return result.rows[0] ? toAddress(result.rows[0]) : null
    })
}

export const deleteCustomerAddress = async (id: string, customerId: string, replacementId?: string) => {
    return withTransaction(async client => {
        const current = await findOwned(client, id, customerId)
        if (!current) return false
        const others = await execute<{ id: string }>(client, sql`
            SELECT ${customerAddresses.id} AS id FROM ${customerAddresses}
            WHERE ${customerAddresses.customer_id} = ${customerId} AND ${customerAddresses.id} <> ${id}
        `)
        if (replacementId && !current.is_default) {
            throw new AppError('O substituto só vale ao excluir o endereço padrão.', 400)
        }
        if (current.is_default && others.rows.length > 0) {
            if (!replacementId || replacementId === id || !others.rows.some(row => row.id === replacementId)) {
                throw chooseReplacement()
            }
        }
        await execute(client, sql`
            DELETE FROM ${customerAddresses}
            WHERE ${customerAddresses.id} = ${id} AND ${customerAddresses.customer_id} = ${customerId}
        `)
        if (replacementId && current.is_default) {
            await execute(client, sql`
                UPDATE ${customerAddresses}
                SET ${col(customerAddresses.is_default)} = true, ${col(customerAddresses.updated_at)} = NOW()
                WHERE ${customerAddresses.id} = ${replacementId} AND ${customerAddresses.customer_id} = ${customerId}
            `)
        }
        return true
    })
}
