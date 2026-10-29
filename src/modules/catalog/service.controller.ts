import { Request, Response } from 'express'
import { z } from 'zod'
import { AppError } from '../../shared/errors'
import { deleteService, fetchAllServices, findServiceById, insertService, modifyService } from './service.service'

export const createService = async (req: Request, res: Response) => {
    const { name } = req.body

    if (!name) {
        throw new AppError('Service must have a name', 400)
    }

    await insertService(req.body)
    res.status(201).json({ success: true, message: 'Service created successfully!' })
}

export const getAllServices = async (req: Request, res: Response) => {
    const { categoryId } = req.query

    const query = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
    }

    if (categoryId && (typeof categoryId !== 'string' || !z.uuid().safeParse(categoryId).success)) {
        throw new AppError('Invalid Category id', 400)
    }

    const result = await fetchAllServices(typeof categoryId === 'string' ? categoryId : undefined, query)
    res.status(200).json({
        success: true,
        message: 'Services fetched successfully',
        data: result,
    })
}

export const getServiceById = async (req: Request, res: Response) => {
    const { serviceId } = req.params

    if (typeof serviceId !== 'string') {
        throw new AppError('Invalid service id', 400)
    }

    const result = await findServiceById(serviceId)
    res.status(200).json({
        success: true,
        message: 'Service fetched successfully',
        data: result,
    })
}

export const updateService = async (req: Request, res: Response) => {
    const { serviceId } = req.params

    if (!serviceId || typeof serviceId !== 'string') {
        throw new AppError('Invalid id!', 400)
    }

    const result = await modifyService(serviceId, req.body)

    res.status(200).json({
        success: true,
        message: 'Service updated successfully',
        data: result,
    })
}

export const removeService = async (req: Request, res: Response) => {
    const { serviceId } = req.params

    if (!serviceId || typeof serviceId !== 'string') {
        throw new AppError('Invalid id!', 400)
    }

    const result = await deleteService(serviceId)

    if (!result) {
        throw new AppError('Service not found', 404)
    }

    res.status(200).json({
        success: true,
        message: 'Service deleted successfully',
    })
}
