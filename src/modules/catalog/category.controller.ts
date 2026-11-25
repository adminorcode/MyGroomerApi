import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { Role } from '../auth/user.types'
import { fetchAllCategories, findCategoryById, insertCategory, modifyCategory, removeCategory as deleteCategoryRecord } from './category.service'

const IN_USE = 'Não é possível excluir uma categoria que já tem serviço'

export const createCategory = async (req: Request, res: Response) => {
    const created = await insertCategory({
        name: req.body.name,
        description: req.body.description,
    })
    if (!created) throw new AppError('Não foi possível salvar a categoria', 500)
    res.status(201).json({ success: true, message: 'Categoria criada com sucesso', data: created })
}

export const getAllCategories = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const includeInactive = req.query.include_inactive === 'true'
    if (includeInactive && req.user.role !== Role.ADMIN) {
        throw new AppError('A lista com categorias inativas é exclusiva do administrador', 403)
    }
    const result = await fetchAllCategories(includeInactive)
    res.status(200).json({
        success: true,
        message: 'Categorias carregadas',
        data: result,
    })
}

export const getCategoryById = async (req: Request, res: Response) => {
    const result = await findCategoryById(req.params.categoryId as string)
    if (!result) throw new AppError('Categoria não encontrada', 404)
    res.status(200).json({
        success: true,
        message: 'Categoria carregada',
        data: result,
    })
}

export const updateCategory = async (req: Request, res: Response) => {
    const result = await modifyCategory(req.params.categoryId as string, req.body)
    if (!result) throw new AppError('Categoria não encontrada', 404)
    res.status(200).json({
        success: true,
        message: 'Categoria atualizada',
        data: result,
    })
}

export const removeCategory = async (req: Request, res: Response) => {
    const result = await deleteCategoryRecord(req.params.categoryId as string)
    if (result === 'not_found') throw new AppError('Categoria não encontrada', 404)
    if (result === 'in_use') throw new AppError(IN_USE, 409)
    res.status(200).json({
        success: true,
        message: 'Categoria excluída',
    })
}
