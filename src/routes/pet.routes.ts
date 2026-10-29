import { Router } from 'express'
import { createPet, getPet, getPets, updatePet } from '../controllers/pet.controller'
import { authenticate } from '../middlewares/auth.middleware'
import { validate, validateParams } from '../middlewares/validate.middleware'
import { petIdSchema, savePetSchema } from '../validators/pet.validator'

const router = Router()

router.post('/', authenticate, validate(savePetSchema), createPet)
router.get('/', authenticate, getPets)
router.get('/:petId', authenticate, validateParams(petIdSchema), getPet)
router.patch('/:petId', authenticate, validateParams(petIdSchema), validate(savePetSchema), updatePet)

export default router
