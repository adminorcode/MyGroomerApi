import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { isAdmin } from '../../shared/http/role.middleware'
import { validate } from '../../shared/http/validate.middleware'
import { createCategory, getAllCategories, getCategoryById, removeCategory, updateCategory } from './category.controller'
import { createCategorySchema, updateCategorySchema } from './category.schemas'

const router = Router()

router.post('/', authenticate, isAdmin, validate(createCategorySchema), createCategory)
router.get('/', authenticate, getAllCategories)
router.get('/:categoryId', authenticate, getCategoryById)
router.patch('/:categoryId', authenticate, isAdmin, validate(updateCategorySchema), updateCategory)
router.delete('/:categoryId', authenticate, isAdmin, removeCategory)

export default router
