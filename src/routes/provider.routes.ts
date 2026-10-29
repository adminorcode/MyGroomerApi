import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { 
    createProviderService, 
    getProviderServiceById, 
    getProviderServices, 
    getServiceProviders, 
    searchCoverage,
    updateProviderService, 
    removeProviderService,
    registerAsProvider,
    getProviderEarnings
} from "../controllers/provider.controller";
import { validate, validateQuery } from "../middlewares/validate.middleware";
import { addProviderServiceSchema, coverageSearchSchema, registerProviderSchema, updateProviderServiceSchema } from "../validators/provider.validator";

const router = Router()



router.post('/register', authenticate, validate(registerProviderSchema), registerAsProvider)

router.post('/', authenticate,validate(addProviderServiceSchema), createProviderService)

router.get('/service/:serviceId/providers', authenticate, getServiceProviders)

router.get('/coverage', authenticate, validateQuery(coverageSearchSchema), searchCoverage)

router.get('/earnings', authenticate, getProviderEarnings)

router.get('/:providerServiceId', authenticate, getProviderServiceById)

router.get('/', authenticate, getProviderServices)

router.patch('/:providerServiceId', authenticate, validate(updateProviderServiceSchema), updateProviderService)

router.delete('/:providerServiceId', authenticate, removeProviderService)



export default router
