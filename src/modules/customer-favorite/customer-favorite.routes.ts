import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { validate, validateParams } from '../../shared/http/validate.middleware'
import { deleteFavoriteProvider, postFavoriteProvider } from './customer-favorite.controller'
import { favoriteProviderParamsSchema, favoriteProviderSchema } from './customer-favorite.schemas'

const router = Router()

router.post('/', authenticate, validate(favoriteProviderSchema), postFavoriteProvider)
router.delete('/:providerId', authenticate, validateParams(favoriteProviderParamsSchema), deleteFavoriteProvider)

export default router
