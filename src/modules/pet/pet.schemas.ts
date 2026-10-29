import { z } from 'zod'
import { PET_SIZES, PET_SPECIES } from './pet.types'

const emptyNotes = (value: unknown) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

export const savePetSchema = z.object({
    name: z.string({ error: 'Informe o nome do pet' }).trim().min(1, 'Informe o nome do pet').max(60, 'O nome deve ter no máximo 60 caracteres'),
    species: z.enum(PET_SPECIES, { error: 'Informe a espécie' }),
    breed: z.string({ error: 'Informe a raça' }).trim().min(1, 'Informe a raça').max(80, 'A raça deve ter no máximo 80 caracteres'),
    size: z.enum(PET_SIZES, { error: 'Informe o porte' }),
    age_years: z.number({ error: 'Informe a idade em anos' }).int('Informe a idade em anos').min(0, 'A idade não pode ser negativa').max(40, 'Informe uma idade de até 40 anos'),
    notes: z.preprocess(
        emptyNotes,
        z.string().max(500, 'As observações devem ter no máximo 500 caracteres').nullable().optional(),
    ),
})

export const petIdSchema = z.object({
    petId: z.uuid('Pet inválido'),
})

export type SavePetSchema = z.infer<typeof savePetSchema>
