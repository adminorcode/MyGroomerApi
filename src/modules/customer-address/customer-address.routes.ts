import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { validate, validateParams, validateQuery } from '../../shared/http/validate.middleware'
import {
    getCustomerAddresses,
    patchCustomerAddress,
    postCustomerAddress,
    removeCustomerAddress,
} from './customer-address.controller'
import {
    createCustomerAddressSchema,
    customerAddressIdSchema,
    deleteCustomerAddressQuerySchema,
    updateCustomerAddressSchema,
} from './customer-address.schemas'

const router = Router()

router.get('/', authenticate, getCustomerAddresses)
router.post('/', authenticate, validate(createCustomerAddressSchema), postCustomerAddress)
router.patch('/:id', authenticate, validateParams(customerAddressIdSchema), validate(updateCustomerAddressSchema), patchCustomerAddress)
router.delete('/:id', authenticate, validateParams(customerAddressIdSchema), validateQuery(deleteCustomerAddressQuerySchema), removeCustomerAddress)

export default router
