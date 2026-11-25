import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { Role } from '../auth/user.types'
import { fetchAllServices, findServiceById, insertService, modifyService, removeService as deleteServiceRecord } from './service.service'

const IN_USE = 'Não é possível excluir um serviço que já tem oferta de profissional'

export const createService = async (req: Request, res: Response) => {
    const created = await insertService(req.body)
    if (!created) throw new AppError('Não foi possível salvar o serviço', 500)
    res.status(201).json({ success: true, message: 'Serviço criado com sucesso', data: created })
}

export const getAllServices = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const includeInactive = req.query.include_inactive === 'true'
    if (includeInactive && req.user.role !== Role.ADMIN) {
        throw new AppError('A lista com serviços inativos é exclusiva do administrador', 403)
    }
    const { categoryId, page, limit } = req.query as {
        categoryId?: string
        page?: number
        limit?: number
    }
    const result = await fetchAllServices(categoryId, { page, limit }, includeInactive)
    res.status(200).json({
        success: true,
        message: 'Serviços carregados',
        data: result,
    })
}

export const getServiceById = async (req: Request, res: Response) => {
    const result = await findServiceById(req.params.serviceId as string)
    res.status(200).json({
        success: true,
        message: 'Serviço carregado',
        data: result,
    })
}

export const updateService = async (req: Request, res: Response) => {
    const result = await modifyService(req.params.serviceId as string, req.body)
    if (!result) throw new AppError('Serviço não encontrado', 404)
    res.status(200).json({
        success: true,
        message: 'Serviço atualizado',
        data: result,
    })
}

export const removeService = async (req: Request, res: Response) => {
    const result = await deleteServiceRecord(req.params.serviceId as string)
    if (result === 'not_found') throw new AppError('Serviço não encontrado', 404)
    if (result === 'in_use') throw new AppError(IN_USE, 409)
    res.status(200).json({
        success: true,
        message: 'Serviço excluído',
    })
}
