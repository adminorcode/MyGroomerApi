export const PET_SPECIES = ['dog', 'cat', 'other'] as const
export const PET_SIZES = ['small', 'medium', 'large'] as const

export type PetSpecies = typeof PET_SPECIES[number]
export type PetSize = typeof PET_SIZES[number]

export type Pet = {
    id: string
    owner_id: string
    name: string
    species: PetSpecies
    breed: string
    size: PetSize
    age_years: number
    notes: string | null
    photo_url: string | null
    created_at: Date
    updated_at: Date
}

export type SavePetInput = {
    name: string
    species: PetSpecies
    breed: string
    size: PetSize
    age_years: number
    notes: string | null
}
