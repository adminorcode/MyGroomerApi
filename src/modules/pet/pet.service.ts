import { getPool } from '../../config/database.config'
import { Pet, SavePetInput } from './pet.types'

export const insertPet = async (ownerId: string, input: SavePetInput): Promise<Pet | null> => {
    const pool = getPool()
    const result = await pool.query(
        `INSERT INTO pets (owner_id, name, species, breed, size, age_years, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [ownerId, input.name, input.species, input.breed, input.size, input.age_years, input.notes],
    )
    return result.rows[0] || null
}

export const listPetsByOwner = async (ownerId: string): Promise<Pet[]> => {
    const pool = getPool()
    const result = await pool.query(
        `SELECT * FROM pets WHERE owner_id = $1 ORDER BY created_at DESC, name ASC`,
        [ownerId],
    )
    return result.rows
}

export const findPetForOwner = async (petId: string, ownerId: string): Promise<Pet | null> => {
    const pool = getPool()
    const result = await pool.query(
        `SELECT * FROM pets WHERE id = $1 AND owner_id = $2`,
        [petId, ownerId],
    )
    return result.rows[0] || null
}

export const updatePetForOwner = async (petId: string, ownerId: string, input: SavePetInput): Promise<Pet | null> => {
    const pool = getPool()
    const result = await pool.query(
        `UPDATE pets
         SET name = $1, species = $2, breed = $3, size = $4, age_years = $5, notes = $6, updated_at = NOW()
         WHERE id = $7 AND owner_id = $8
         RETURNING *`,
        [input.name, input.species, input.breed, input.size, input.age_years, input.notes, petId, ownerId],
    )
    return result.rows[0] || null
}
