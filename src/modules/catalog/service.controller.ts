import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { deleteService, fetchAllServices, findServiceById, insertService, modifyService } from './service.service'

export const createService = async (req: Request, res: Response) => {
    await insertService(req.body)
    res.status(201).json({ success: true, message: 'Serviço criado com sucesso' })
}

export const getAllServices = async (req: Request, res: Response) => {
    const { categoryId, page, limit } = req.query as {
        categoryId?: string
        page?: number
        limit?: number
    }
    const result = await fetchAllServices(categoryId, { page, limit })
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
    res.status(200).json({
        success: true,
        message: 'Serviço atualizado',
        data: result,
    })
}

export const removeService = async (req: Request, res: Response) => {
    const result = await deleteService(req.params.serviceId as string)
    if (!result) throw new AppError('Serviço não encontrado', 404)
    res.status(200).json({
        success: true,
        message: 'Serviço excluído',
    })
}
