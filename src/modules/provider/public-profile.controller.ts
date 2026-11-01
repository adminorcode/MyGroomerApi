import { NextFunction, Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { Role } from '../auth/user.types'
import {
    addGalleryPhoto,
    clearPublicPhoto,
    readGalleryPhoto,
    readOwnPublicProfile,
    readPublicPhoto,
    removeGalleryPhoto,
    writePublicDescription,
    writePublicPhoto,
} from './public-profile.service'
import { PublicDescriptionInput, PublicPhotoInput } from './public-profile.schemas'

export const requireProvider = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== Role.PROVIDER) {
        res.status(403).json({ message: 'Este cadastro é exclusivo de profissionais.' })
        return
    }
    next()
}

const ownerId = (req: Request): string => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    return req.user.id
}

export const getOwnPublicProfile = async (req: Request, res: Response) => {
    res.status(200).json({ success: true, data: await readOwnPublicProfile(ownerId(req)) })
}

export const putPublicDescription = async (req: Request, res: Response) => {
    const profile = await writePublicDescription(ownerId(req), req.body as PublicDescriptionInput)
    res.status(200).json({ success: true, data: profile })
}

export const putPublicPhoto = async (req: Request, res: Response) => {
    const profile = await writePublicPhoto(ownerId(req), req.body as PublicPhotoInput)
    res.status(200).json({ success: true, data: profile })
}

export const deletePublicPhoto = async (req: Request, res: Response) => {
    await clearPublicPhoto(ownerId(req))
    res.status(204).end()
}

export const postGalleryPhoto = async (req: Request, res: Response) => {
    const photo = await addGalleryPhoto(ownerId(req), req.body as PublicPhotoInput)
    res.status(201).json({ success: true, data: photo })
}

export const deleteGalleryPhoto = async (req: Request, res: Response) => {
    await removeGalleryPhoto(ownerId(req), req.params.photoId as string)
    res.status(204).end()
}

const sendImage = (res: Response, image: { mimeType: string, content: Buffer }) => {
    res.status(200)
    res.setHeader('Content-Type', image.mimeType)
    res.setHeader('Content-Length', String(image.content.length))
    res.setHeader('Cache-Control', 'private')
    res.end(image.content)
}

export const getGalleryPhoto = async (req: Request, res: Response) => {
    sendImage(res, await readGalleryPhoto(req.params.photoId as string, ownerId(req)))
}

export const getPublicPhoto = async (req: Request, res: Response) => {
    sendImage(res, await readPublicPhoto(req.params.providerId as string, ownerId(req)))
}
