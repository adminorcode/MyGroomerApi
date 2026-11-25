import { randomUUID } from 'crypto'
import { PoolClient } from 'pg'
import { col, execute, sql } from '../../shared/db/drizzle'
import { Pet, SavePetInput } from './pet.types'
import { pets } from './pet.table'

type PetRow = {
    id: string
    owner_id: string
    name: Pet['name']
    species: Pet['species']
    breed: string
    size: Pet['size']
    age_years: number
    notes: string | null
    photo_url: string | null
    photo_id: string | null
    weight_kg: string | number | null
    allergies: string | null
    medications: string | null
    health_conditions: string | null
    vaccination_up_to_date: boolean | null
    behavior: string | null
    special_care: string | null
    created_at: Date
    updated_at: Date
}

const petColumns = sql`
    ${pets.id}, ${pets.owner_id}, ${pets.name}, ${pets.species}, ${pets.breed}, ${pets.size},
    ${pets.age_years}, ${pets.notes}, ${pets.photo_url}, ${pets.photo_id}, ${pets.weight_kg},
    ${pets.allergies}, ${pets.medications}, ${pets.health_conditions}, ${pets.vaccination_up_to_date},
    ${pets.behavior}, ${pets.special_care}, ${pets.created_at}, ${pets.updated_at}
`

const present = (row: PetRow): Pet => {
    const weight = row.weight_kg == null || row.weight_kg === '' ? null : Number(row.weight_kg)
    return {
        id: row.id,
        owner_id: row.owner_id,
        name: row.name,
        species: row.species,
        breed: row.breed,
        size: row.size,
        age_years: row.age_years,
        notes: row.notes,
        photo_url: row.photo_url,
        photo_id: row.photo_id,
        has_photo: Boolean(row.photo_id || row.photo_url?.trim()),
        weight_kg: weight != null && Number.isFinite(weight) ? weight : null,
        allergies: row.allergies,
        medications: row.medications,
        health_conditions: row.health_conditions,
        vaccination_up_to_date: row.vaccination_up_to_date,
        behavior: row.behavior,
        special_care: row.special_care,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

export const petHasPhoto = (pet: Pick<Pet, 'has_photo' | 'photo_url' | 'photo_id'>) =>
    pet.has_photo || Boolean(pet.photo_id || pet.photo_url?.trim())

export const insertPet = async (ownerId: string, input: SavePetInput): Promise<Pet | null> => {
    const photoId = input.photo ? randomUUID() : null
    const result = await execute<PetRow>(undefined, sql`
        INSERT INTO ${pets} (
            owner_id, name, species, breed, size, age_years, notes, weight_kg,
            photo, photo_mime, photo_id,
            allergies, medications, health_conditions, vaccination_up_to_date, behavior, special_care
        )
        VALUES (
            ${ownerId}, ${input.name}, ${input.species}, ${input.breed}, ${input.size}, ${input.age_years}, ${input.notes}, ${input.weight_kg},
            ${input.photo?.bytes ?? null}, ${input.photo?.mime_type ?? null}, ${photoId},
            ${input.allergies}, ${input.medications}, ${input.health_conditions}, ${input.vaccination_up_to_date}, ${input.behavior}, ${input.special_care}
        )
        RETURNING ${petColumns}
    `)
    return result.rows[0] ? present(result.rows[0]) : null
}

export const listPetsByOwner = async (ownerId: string): Promise<Pet[]> => {
    const result = await execute<PetRow>(undefined, sql`
        SELECT ${petColumns} FROM ${pets}
        WHERE ${pets.owner_id} = ${ownerId}
        ORDER BY ${pets.created_at} DESC, ${pets.name} ASC
    `)
    return result.rows.map(present)
}

export const findPetForOwner = async (petId: string, ownerId: string, client?: PoolClient, lock = false): Promise<Pet | null> => {
    const share = lock && client ? sql` FOR SHARE` : sql``
    const result = await execute<PetRow>(client, sql`
        SELECT ${petColumns} FROM ${pets}
        WHERE ${pets.id} = ${petId} AND ${pets.owner_id} = ${ownerId}${share}
    `)
    return result.rows[0] ? present(result.rows[0]) : null
}

export const updatePetForOwner = async (petId: string, ownerId: string, input: SavePetInput): Promise<Pet | null> => {
    const photoId = input.photo ? randomUUID() : null
    const result = await execute<PetRow>(undefined, sql`
        UPDATE ${pets}
        SET ${col(pets.name)} = ${input.name},
            ${col(pets.species)} = ${input.species},
            ${col(pets.breed)} = ${input.breed},
            ${col(pets.size)} = ${input.size},
            ${col(pets.age_years)} = ${input.age_years},
            ${col(pets.notes)} = ${input.notes},
            ${col(pets.weight_kg)} = ${input.weight_kg},
            ${col(pets.photo)} = COALESCE(${input.photo?.bytes ?? null}, ${pets.photo}),
            ${col(pets.photo_mime)} = COALESCE(${input.photo?.mime_type ?? null}, ${pets.photo_mime}),
            ${col(pets.photo_id)} = COALESCE(${photoId}, ${pets.photo_id}),
            ${col(pets.allergies)} = ${input.allergies},
            ${col(pets.medications)} = ${input.medications},
            ${col(pets.health_conditions)} = ${input.health_conditions},
            ${col(pets.vaccination_up_to_date)} = ${input.vaccination_up_to_date},
            ${col(pets.behavior)} = ${input.behavior},
            ${col(pets.special_care)} = ${input.special_care},
            ${col(pets.updated_at)} = NOW()
        WHERE ${pets.id} = ${petId} AND ${pets.owner_id} = ${ownerId}
        RETURNING ${petColumns}
    `)
    return result.rows[0] ? present(result.rows[0]) : null
}

export const readPetPhotoForOwner = async (petId: string, ownerId: string): Promise<{ mimeType: string, content: Buffer } | null> => {
    const result = await execute<{ photo: Buffer | null, photo_mime: string | null }>(undefined, sql`
        SELECT ${pets.photo} AS photo, ${pets.photo_mime} AS photo_mime
        FROM ${pets}
        WHERE ${pets.id} = ${petId} AND ${pets.owner_id} = ${ownerId}
    `)
    const row = result.rows[0]
    if (!row?.photo || !row.photo_mime) return null
    return { mimeType: row.photo_mime, content: Buffer.isBuffer(row.photo) ? row.photo : Buffer.from(row.photo) }
}
