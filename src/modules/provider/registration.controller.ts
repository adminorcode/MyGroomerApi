import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { Role } from '../auth/user.types'
import { findProviderByUserId } from './provider.service'
import { readRegistration, saveRegistration } from './registration.service'

const providerFor = async (req: Request) => {
    if (!req.user) throw new AppError('Não autorizado.', 401)
    if (req.user.role !== Role.PROVIDER) throw new AppError('Este cadastro é exclusivo de profissionais.', 403)
    const provider = await findProviderByUserId(req.user.id)
    if (!provider) throw new AppError('Perfil profissional não encontrado.', 404)
    return provider
}

export const getRegistration = async (req: Request, res: Response) => {
    const provider = await providerFor(req)
    res.json({ success: true, data: await readRegistration(provider.id) })
}

export const putRegistration = async (req: Request, res: Response) => {
    const provider = await providerFor(req)
    res.json({ success: true, data: await saveRegistration(provider.id, req.body) })
}
