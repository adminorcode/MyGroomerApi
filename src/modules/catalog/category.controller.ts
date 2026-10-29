import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { deleteCategory, fetchAllCategories, findCategoryById, insertCategory, modifyCategory } from './category.service'

export const createCategory = async (req: Request, res: Response) => {
    const { name } = req.body

    if (!name) {
        throw new AppError('Category must have a name', 400)
    }

    await insertCategory(req.body)
    res.status(201).json({ success: true, message: 'Category created successfully!' })
}

export const getAllCategories = async (_req: Request, res: Response) => {
    const result = await fetchAllCategories()
    res.status(200).json({
        success: true,
        message: 'Categories fetched successfully',
        data: result,
    })
}

export const getCategoryById = async (req: Request, res: Response) => {
    const { categoryId } = req.params

    if (typeof categoryId !== 'string') {
        throw new AppError('Invalid category id', 400)
    }

    const result = await findCategoryById(categoryId)
    res.status(200).json({
        success: true,
        message: 'Category fetched successfully',
        data: result,
    })
}

export const updateCategory = async (req: Request, res: Response) => {
    const { categoryId } = req.params

    if (!categoryId || typeof categoryId !== 'string') {
        throw new AppError('Invalid id!', 400)
    }

    const result = await modifyCategory(categoryId, req.body)

    res.status(200).json({
        success: true,
        message: 'Category updated successfully',
        data: result,
    })
}

export const removeCategory = async (req: Request, res: Response) => {
    const { categoryId } = req.params

    if (!categoryId || typeof categoryId !== 'string') {
        throw new AppError('Invalid id!', 400)
    }

    const result = await deleteCategory(categoryId)

    if (!result) {
        throw new AppError('Category not found', 404)
    }

    res.status(200).json({
        success: true,
        message: 'Category deleted successfully',
    })
}
