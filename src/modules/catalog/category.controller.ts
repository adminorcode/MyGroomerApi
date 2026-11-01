import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { deleteCategory, fetchAllCategories, findCategoryById, insertCategory, modifyCategory } from './category.service'

export const createCategory = async (req: Request, res: Response) => {
    await insertCategory(req.body)
    res.status(201).json({ success: true, message: 'Categoria criada com sucesso' })
}

export const getAllCategories = async (_req: Request, res: Response) => {
    const result = await fetchAllCategories()
    res.status(200).json({
        success: true,
        message: 'Categorias carregadas',
        data: result,
    })
}

export const getCategoryById = async (req: Request, res: Response) => {
    const result = await findCategoryById(req.params.categoryId as string)
    res.status(200).json({
        success: true,
        message: 'Categoria carregada',
        data: result,
    })
}

export const updateCategory = async (req: Request, res: Response) => {
    const result = await modifyCategory(req.params.categoryId as string, req.body)
    res.status(200).json({
        success: true,
        message: 'Categoria atualizada',
        data: result,
    })
}

export const removeCategory = async (req: Request, res: Response) => {
    const result = await deleteCategory(req.params.categoryId as string)
    if (!result) throw new AppError('Categoria não encontrada', 404)
    res.status(200).json({
        success: true,
        message: 'Categoria excluída',
    })
}
