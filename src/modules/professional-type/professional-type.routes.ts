import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { isAdmin } from '../../shared/http/role.middleware'
import { validate, validateParams, validateQuery } from '../../shared/http/validate.middleware'
import {
    createProfessionalType,
    deleteProfessionalType,
    getProfessionalTypes,
    getPublicProfessionalTypes,
    updateProfessionalType,
} from './professional-type.controller'
import {
    createProfessionalTypeSchema,
    listProfessionalTypesQuerySchema,
    professionalTypeIdSchema,
    updateProfessionalTypeSchema,
} from './professional-type.schemas'

const router = Router()

router.get('/public', getPublicProfessionalTypes)

router.post('/', authenticate, isAdmin, validate(createProfessionalTypeSchema), createProfessionalType)
router.get('/', authenticate, validateQuery(listProfessionalTypesQuerySchema), getProfessionalTypes)
router.patch(
    '/:typeId',
    authenticate,
    isAdmin,
    validateParams(professionalTypeIdSchema),
    validate(updateProfessionalTypeSchema),
    updateProfessionalType,
)
router.delete(
    '/:typeId',
    authenticate,
    isAdmin,
    validateParams(professionalTypeIdSchema),
    deleteProfessionalType,
)

export default router
