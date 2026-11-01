import { PoolClient } from 'pg'
import { col, execute, sql } from '../../shared/db/drizzle'
import { Pet, SavePetInput } from './pet.types'
import { pets } from './pet.table'

export const insertPet = async (ownerId: string, input: SavePetInput): Promise<Pet | null> => {
    const result = await execute<Pet>(undefined, sql`
        INSERT INTO ${pets} (owner_id, name, species, breed, size, age_years, notes)
        VALUES (${ownerId}, ${input.name}, ${input.species}, ${input.breed}, ${input.size}, ${input.age_years}, ${input.notes})
        RETURNING *
    `)
    return result.rows[0] || null
}

export const listPetsByOwner = async (ownerId: string): Promise<Pet[]> => {
    const result = await execute<Pet>(undefined, sql`
        SELECT * FROM ${pets}
        WHERE ${pets.owner_id} = ${ownerId}
        ORDER BY ${pets.created_at} DESC, ${pets.name} ASC
    `)
    return result.rows
}

export const findPetForOwner = async (petId: string, ownerId: string, client?: PoolClient, lock = false): Promise<Pet | null> => {
    const share = lock && client ? sql` FOR SHARE` : sql``
    const result = await execute<Pet>(client, sql`
        SELECT * FROM ${pets}
        WHERE ${pets.id} = ${petId} AND ${pets.owner_id} = ${ownerId}${share}
    `)
    return result.rows[0] || null
}

export const updatePetForOwner = async (petId: string, ownerId: string, input: SavePetInput): Promise<Pet | null> => {
    const result = await execute<Pet>(undefined, sql`
        UPDATE ${pets}
        SET ${col(pets.name)} = ${input.name},
            ${col(pets.species)} = ${input.species},
            ${col(pets.breed)} = ${input.breed},
            ${col(pets.size)} = ${input.size},
            ${col(pets.age_years)} = ${input.age_years},
            ${col(pets.notes)} = ${input.notes},
            ${col(pets.updated_at)} = NOW()
        WHERE ${pets.id} = ${petId} AND ${pets.owner_id} = ${ownerId}
        RETURNING *
    `)
    return result.rows[0] || null
}
