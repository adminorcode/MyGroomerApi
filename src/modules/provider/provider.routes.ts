import { Router } from "express";
import { authenticate } from "../../shared/http/auth.middleware";
import { 
    createProviderService, 
    getProviderServiceById,
    getPublicProfile, 
    getProviderServices, 
    getServiceProviders, 
    searchCoverage,
    updateProviderService, 
    removeProviderService,
    registerAsProvider,
    getProviderEarnings,
    getProviderMenu,
    getServiceLocation,
    autocompleteServiceLocation,
    lookupServicePostalCode,
    mapTiles,
    previewServiceLocation,
    saveProviderMenu,
    saveServiceLocation,
} from "./provider.controller";
import { validate, validateQuery } from "../../shared/http/validate.middleware";
import { addProviderServiceSchema, addressAutocompleteSchema, coverageSearchSchema, registerProviderSchema, saveMenuSchema, saveServiceLocationSchema, serviceLocationPreviewSchema, servicePostalCodeSchema, updateProviderServiceSchema } from "./provider.schemas";

const router = Router()



router.post('/register', authenticate, validate(registerProviderSchema), registerAsProvider)

router.post('/', authenticate,validate(addProviderServiceSchema), createProviderService)

router.get('/service/:serviceId/providers', authenticate, getServiceProviders)

router.get('/coverage', authenticate, validateQuery(coverageSearchSchema), searchCoverage)

router.get('/earnings', authenticate, getProviderEarnings)

router.get('/menu', authenticate, getProviderMenu)

router.put('/menu', authenticate, validate(saveMenuSchema), saveProviderMenu)

router.get('/service-location/autocomplete', authenticate, validateQuery(addressAutocompleteSchema), autocompleteServiceLocation)

router.get('/service-location/map-tiles', authenticate, mapTiles)

router.get('/service-location/postal-code', authenticate, validateQuery(servicePostalCodeSchema), lookupServicePostalCode)

router.get('/service-location/preview', authenticate, validateQuery(serviceLocationPreviewSchema), previewServiceLocation)

router.get('/service-location', authenticate, getServiceLocation)

router.put('/service-location', authenticate, validate(saveServiceLocationSchema), saveServiceLocation)

router.get('/:providerServiceId/profile', authenticate, getPublicProfile)

router.get('/:providerServiceId', authenticate, getProviderServiceById)

router.get('/', authenticate, getProviderServices)

router.patch('/:providerServiceId', authenticate, validate(updateProviderServiceSchema), updateProviderService)

router.delete('/:providerServiceId', authenticate, removeProviderService)



export default router
