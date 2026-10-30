import { Router } from "express";
import { authenticate } from "../../shared/http/auth.middleware";
import { 
    createProviderService, 
    getProviderServiceById, 
    getProviderServices, 
    getServiceProviders, 
    searchCoverage,
    updateProviderService, 
    removeProviderService,
    registerAsProvider,
    getProviderEarnings,
    getProviderMenu,
    saveProviderMenu,
} from "./provider.controller";
import { validate, validateQuery } from "../../shared/http/validate.middleware";
import { addProviderServiceSchema, coverageSearchSchema, registerProviderSchema, saveMenuSchema, updateProviderServiceSchema } from "./provider.schemas";

const router = Router()



router.post('/register', authenticate, validate(registerProviderSchema), registerAsProvider)

router.post('/', authenticate,validate(addProviderServiceSchema), createProviderService)

router.get('/service/:serviceId/providers', authenticate, getServiceProviders)

router.get('/coverage', authenticate, validateQuery(coverageSearchSchema), searchCoverage)

router.get('/earnings', authenticate, getProviderEarnings)

router.get('/menu', authenticate, getProviderMenu)

router.put('/menu', authenticate, validate(saveMenuSchema), saveProviderMenu)

router.get('/:providerServiceId', authenticate, getProviderServiceById)

router.get('/', authenticate, getProviderServices)

router.patch('/:providerServiceId', authenticate, validate(updateProviderServiceSchema), updateProviderService)

router.delete('/:providerServiceId', authenticate, removeProviderService)



export default router
