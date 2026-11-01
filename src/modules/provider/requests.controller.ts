import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { findProviderByUserId } from './provider.service'
import { ProviderRequestsQuery } from './requests.schemas'
import { listProviderRequests } from './requests.service'

export const getProviderRequests = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const provider = await findProviderByUserId(req.user.id)
    if (!provider) throw new AppError('Perfil do groomer não encontrado', 404)
    const data = await listProviderRequests(provider.id, req.query as unknown as ProviderRequestsQuery)
    res.json({ success: true, data })
}
