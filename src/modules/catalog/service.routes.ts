import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { isAdmin } from '../../shared/http/role.middleware'
import { validate, validateParams, validateQuery } from '../../shared/http/validate.middleware'
import { createService, getAllServices, getServiceById, removeService, updateService } from './service.controller'
import { createServiceSchema, listServicesQuerySchema, serviceIdSchema, updateServiceSchema } from './service.schemas'

const router = Router()

router.post('/', authenticate, isAdmin, validate(createServiceSchema), createService)
router.get('/', authenticate, validateQuery(listServicesQuerySchema), getAllServices)
router.get('/:serviceId', authenticate, validateParams(serviceIdSchema), getServiceById)
router.patch('/:serviceId', authenticate, isAdmin, validateParams(serviceIdSchema), validate(updateServiceSchema), updateService)
router.delete('/:serviceId', authenticate, isAdmin, validateParams(serviceIdSchema), removeService)

export default router
