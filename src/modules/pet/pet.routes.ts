import { Router, json } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { validate, validateParams } from '../../shared/http/validate.middleware'
import { createPet, getPet, getPetPhoto, getPets, updatePet } from './pet.controller'
import { petIdSchema, savePetSchema } from './pet.schemas'

const router = Router()
const petJson = json({ limit: '15mb' })

router.post('/', authenticate, petJson, validate(savePetSchema), createPet)
router.get('/', authenticate, getPets)
router.get('/:petId/photo', authenticate, validateParams(petIdSchema), getPetPhoto)
router.get('/:petId', authenticate, validateParams(petIdSchema), getPet)
router.patch('/:petId', authenticate, petJson, validateParams(petIdSchema), validate(savePetSchema), updatePet)

export default router
