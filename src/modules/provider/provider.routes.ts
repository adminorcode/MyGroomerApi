import { Router, json } from "express";
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
    getWeeklyAvailability,
    saveWeeklyAvailability,
    listWeeklySlots,
    addManualAppointment,
} from "./provider.controller";
import { validate, validateQuery } from "../../shared/http/validate.middleware";
import { addProviderServiceSchema, addressAutocompleteSchema, coverageSearchSchema, manualAppointmentSchema, registerProviderSchema, saveMenuSchema, saveServiceLocationSchema, saveWeeklyAvailabilitySchema, serviceLocationPreviewSchema, servicePostalCodeSchema, updateProviderServiceSchema, weeklySlotsQuerySchema } from "./provider.schemas";
import { getRegistration, putRegistration } from './registration.controller';
import { saveRegistrationSchema } from './registration.schemas';

const router = Router()



router.post('/register', authenticate, validate(registerProviderSchema), registerAsProvider)

router.get('/registration', authenticate, getRegistration)
router.put('/registration', authenticate, (req, res, next) => {
    if (req.user?.role !== 'provider') {
        res.status(403).json({ message: 'Este cadastro é exclusivo de profissionais.' })
        return
    }
    next()
}, json({ limit: '70mb' }), validate(saveRegistrationSchema), putRegistration)

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

router.get('/weekly-availability/slots', authenticate, validateQuery(weeklySlotsQuerySchema), listWeeklySlots)

router.post('/weekly-availability/appointments', authenticate, validate(manualAppointmentSchema), addManualAppointment)

router.get('/weekly-availability', authenticate, getWeeklyAvailability)

router.put('/weekly-availability', authenticate, validate(saveWeeklyAvailabilitySchema), saveWeeklyAvailability)

router.get('/:providerServiceId/profile', authenticate, getPublicProfile)

router.get('/:providerServiceId', authenticate, getProviderServiceById)

router.get('/', authenticate, getProviderServices)

router.patch('/:providerServiceId', authenticate, validate(updateProviderServiceSchema), updateProviderService)

router.delete('/:providerServiceId', authenticate, removeProviderService)



export default router
