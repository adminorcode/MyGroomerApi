import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { isAdmin } from '../../shared/http/role.middleware'
import { validate } from '../../shared/http/validate.middleware'
import { createService, getAllServices, getServiceById, removeService, updateService } from './service.controller'
import { createServiceSchema, updateServiceSchema } from './service.schemas'

const router = Router()

router.post('/', authenticate, isAdmin, validate(createServiceSchema), createService)
router.get('/', authenticate, getAllServices)
router.get('/:serviceId', authenticate, getServiceById)
router.patch('/:serviceId', authenticate, isAdmin, validate(updateServiceSchema), updateService)
router.delete('/:serviceId', authenticate, isAdmin, removeService)

export default router
