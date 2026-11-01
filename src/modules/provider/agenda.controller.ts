import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { findProviderByUserId } from './provider.service'
import { createAgendaBlock, deleteAgendaBlock, listAgendaBlocks } from './agenda.service'

const ownerProvider = async (req: Request) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const provider = await findProviderByUserId(req.user.id)
    if (!provider) throw new AppError('Perfil do groomer não encontrado', 404)
    return provider
}

export const getAgendaBlocks = async (req: Request, res: Response) => {
    const provider = await ownerProvider(req)
    res.json({ success: true, data: await listAgendaBlocks(provider.id) })
}

export const postAgendaBlock = async (req: Request, res: Response) => {
    const provider = await ownerProvider(req)
    res.status(201).json({ success: true, data: await createAgendaBlock(provider.id, req.body) })
}

export const removeAgendaBlock = async (req: Request, res: Response) => {
    const provider = await ownerProvider(req)
    await deleteAgendaBlock(provider.id, req.params.blockId as string)
    res.status(204).end()
}
