import { Request, Response } from 'express'
import { isPetPhotoRequired } from '../../config/runtime.config'
import { AppError } from '../../shared/errors'
import { Role } from '../auth/user.types'
import { findPetForOwner, insertPet, listPetsByOwner, petHasPhoto, readPetPhotoForOwner, updatePetForOwner } from './pet.service'
import { SavePetSchema } from './pet.schemas'
import { SavePetInput } from './pet.types'

const requireTutor = (req: Request) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    if (req.user.role !== Role.CUSTOMER) throw new AppError('Apenas o tutor pode gerenciar pets da própria conta', 403)
    return req.user
}

const photoMissing = (res: Response) => {
    res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: [{ field: 'photo', message: 'Informe a foto do pet' }],
    })
}

const toInput = (body: SavePetSchema): SavePetInput => ({
    name: body.name,
    species: body.species,
    breed: body.breed,
    size: body.size,
    age_years: body.age_years,
    notes: body.notes ?? null,
    weight_kg: body.weight_kg,
    photo: body.photo ? { mime_type: body.photo.mime_type, bytes: Buffer.from(body.photo.base64, 'base64') } : null,
    allergies: body.allergies ?? null,
    medications: body.medications ?? null,
    health_conditions: body.health_conditions ?? null,
    vaccination_up_to_date: body.vaccination_up_to_date ?? null,
    behavior: body.behavior ?? null,
    special_care: body.special_care ?? null,
})

const sendImage = (res: Response, image: { mimeType: string, content: Buffer }) => {
    res.status(200)
    res.setHeader('Content-Type', image.mimeType)
    res.setHeader('Content-Length', String(image.content.length))
    res.setHeader('Cache-Control', 'private')
    res.end(image.content)
}

export const createPet = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const body = req.body as SavePetSchema
    if (isPetPhotoRequired() && !body.photo) {
        photoMissing(res)
        return
    }
    const pet = await insertPet(user.id, toInput(body))
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

export const getPetPhoto = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const image = await readPetPhotoForOwner(req.params.petId as string, user.id)
    if (!image) throw new AppError('Foto do pet não encontrada', 404)
    sendImage(res, image)
}

export const updatePet = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const body = req.body as SavePetSchema
    const current = await findPetForOwner(req.params.petId as string, user.id)
    if (!current) throw new AppError('Pet não encontrado', 404)
    if (isPetPhotoRequired() && !body.photo && !petHasPhoto(current)) {
        photoMissing(res)
        return
    }
    const pet = await updatePetForOwner(req.params.petId as string, user.id, toInput(body))
    if (!pet) throw new AppError('Pet não encontrado', 404)
    res.status(200).json({ success: true, data: pet })
}
