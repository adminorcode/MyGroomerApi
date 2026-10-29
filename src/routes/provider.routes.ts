import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { 
    createProviderService, 
    getProviderServiceById, 
    getProviderServices, 
    getServiceProviders, 
    updateProviderService, 
    removeProviderService,
    registerAsProvider,
    getProviderEarnings
} from "../controllers/provider.controller";
import { validate } from "../middlewares/validate.middleware";
import { addProviderServiceSchema, registerProviderSchema, updateProviderServiceSchema } from "../validators/provider.validator";

const router = Router()



router.post('/register', authenticate, validate(registerProviderSchema), registerAsProvider)

router.post('/', authenticate,validate(addProviderServiceSchema), createProviderService)

router.get('/service/:serviceId/providers', authenticate, getServiceProviders)

router.get('/earnings', authenticate, getProviderEarnings)

router.get('/:providerServiceId', authenticate, getProviderServiceById)

router.get('/', authenticate, getProviderServices)

router.patch('/:providerServiceId', authenticate, validate(updateProviderServiceSchema), updateProviderService)

router.delete('/:providerServiceId', authenticate, removeProviderService)



export default router
