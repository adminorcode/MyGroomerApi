import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { validate, validateParams } from '../../shared/http/validate.middleware'
import { createPet, getPet, getPets, updatePet } from './pet.controller'
import { petIdSchema, savePetSchema } from './pet.schemas'

const router = Router()

router.post('/', authenticate, validate(savePetSchema), createPet)
router.get('/', authenticate, getPets)
router.get('/:petId', authenticate, validateParams(petIdSchema), getPet)
router.patch('/:petId', authenticate, validateParams(petIdSchema), validate(savePetSchema), updatePet)

export default router
