import { Request, Response } from 'express'
import { AppError } from '../middlewares/errorHandler'
import { findPetForOwner, insertPet, listPetsByOwner, updatePetForOwner } from '../services/pet.service'
import { SavePetInput } from '../types/pet.types'
import { Role } from '../types/user.types'
import { SavePetSchema } from '../validators/pet.validator'

const requireTutor = (req: Request) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    if (req.user.role !== Role.CUSTOMER) throw new AppError('Apenas o tutor pode gerenciar pets da própria conta', 403)
    return req.user
}

const toInput = (body: SavePetSchema): SavePetInput => ({
    name: body.name,
    species: body.species,
    breed: body.breed,
    size: body.size,
    age_years: body.age_years,
    notes: body.notes ?? null,
})

export const createPet = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const pet = await insertPet(user.id, toInput(req.body))
    if (!pet) throw new AppError('Não foi possível salvar o pet', 500)
    res.status(201).json({ success: true, data: pet })
}

export const getPets = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const pets = await listPetsByOwner(user.id)
    res.status(200).json({ success: true, data: pets })
}

export const getPet = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const pet = await findPetForOwner(req.params.petId as string, user.id)
    if (!pet) throw new AppError('Pet não encontrado', 404)
    res.status(200).json({ success: true, data: pet })
}

export const updatePet = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const pet = await updatePetForOwner(req.params.petId as string, user.id, toInput(req.body))
    if (!pet) throw new AppError('Pet não encontrado', 404)
    res.status(200).json({ success: true, data: pet })
}
