import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { isAdmin } from '../../shared/http/role.middleware'
import { validate, validateParams } from '../../shared/http/validate.middleware'
import { createCategory, getAllCategories, getCategoryById, removeCategory, updateCategory } from './category.controller'
import { categoryIdSchema, createCategorySchema, updateCategorySchema } from './category.schemas'

const router = Router()

router.post('/', authenticate, isAdmin, validate(createCategorySchema), createCategory)
router.get('/', authenticate, getAllCategories)
router.get('/:categoryId', authenticate, validateParams(categoryIdSchema), getCategoryById)
router.patch('/:categoryId', authenticate, isAdmin, validateParams(categoryIdSchema), validate(updateCategorySchema), updateCategory)
router.delete('/:categoryId', authenticate, isAdmin, validateParams(categoryIdSchema), removeCategory)

export default router
