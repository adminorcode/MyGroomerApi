import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { findProviderByUserId } from './provider.service'
import { AnamnesisNoteSchema } from './request-profile.schemas'
import { getProviderRequestProfile, readRequestPetPhoto, saveAnamnesisNote } from './request-profile.service'

const ownerProvider = async (req: Request) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const provider = await findProviderByUserId(req.user.id)
    if (!provider) throw new AppError('Perfil do groomer não encontrado', 404)
    return provider
}

export const getRequestProfile = async (req: Request, res: Response) => {
    const provider = await ownerProvider(req)
    const data = await getProviderRequestProfile(provider.id, req.params.bookingId as string)
    res.json({ success: true, data })
}

export const getRequestPetPhoto = async (req: Request, res: Response) => {
    const provider = await ownerProvider(req)
    const image = await readRequestPetPhoto(provider.id, req.params.bookingId as string)
    res.status(200)
    res.setHeader('Content-Type', image.mimeType)
    res.setHeader('Content-Length', String(image.content.length))
    res.setHeader('Cache-Control', 'private')
    res.end(image.content)
}

export const putAnamnesisNote = async (req: Request, res: Response) => {
    const provider = await ownerProvider(req)
    const body = req.body as AnamnesisNoteSchema
    const data = await saveAnamnesisNote(provider.id, req.params.bookingId as string, body.note)
    res.json({ success: true, data })
}
