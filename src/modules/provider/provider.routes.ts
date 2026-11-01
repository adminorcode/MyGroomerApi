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
import { addProviderServiceSchema, addressAutocompleteSchema, coverageSearchSchema, manualAppointmentSchema, providerServiceIdSchema, registerProviderSchema, saveMenuSchema, saveServiceLocationSchema, saveWeeklyAvailabilitySchema, serviceLocationPreviewSchema, servicePostalCodeSchema, updateProviderServiceSchema, weeklySlotsQuerySchema } from "./provider.schemas";
import { getRegistration, putRegistration } from './registration.controller';
import { saveRegistrationSchema } from './registration.schemas';
import { deleteGalleryPhoto, deletePublicPhoto, getGalleryPhoto, getOwnPublicProfile, getPublicPhoto, postGalleryPhoto, putPublicDescription, putPublicPhoto, requireProvider } from './public-profile.controller';
import { galleryPhotoParamsSchema, publicDescriptionSchema, publicPhotoParamsSchema, publicPhotoSchema } from './public-profile.schemas';
import { getAgenda, getAgendaBlocks, postAgendaBlock, removeAgendaBlock } from './agenda.controller';
import { agendaBlockSchema, agendaBlockParamsSchema, agendaQuerySchema } from './agenda.schemas';
import { getProviderRequests } from './requests.controller';
import { providerRequestsQuerySchema } from './requests.schemas';
import { validateParams } from '../../shared/http/validate.middleware';

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

router.get('/me/public-profile', authenticate, requireProvider, getOwnPublicProfile)
router.put('/me/description', authenticate, requireProvider, validate(publicDescriptionSchema), putPublicDescription)
router.put('/me/photo', authenticate, requireProvider, json({ limit: '70mb' }), validate(publicPhotoSchema), putPublicPhoto)
router.delete('/me/photo', authenticate, requireProvider, deletePublicPhoto)
router.post('/me/gallery', authenticate, requireProvider, json({ limit: '70mb' }), validate(publicPhotoSchema), postGalleryPhoto)
router.delete('/me/gallery/:photoId', authenticate, requireProvider, validateParams(galleryPhotoParamsSchema), deleteGalleryPhoto)
router.get('/gallery/:photoId', authenticate, validateParams(galleryPhotoParamsSchema), getGalleryPhoto)
router.get('/public-photo/:providerId', authenticate, validateParams(publicPhotoParamsSchema), getPublicPhoto)

router.put('/weekly-availability', authenticate, validate(saveWeeklyAvailabilitySchema), saveWeeklyAvailability)

router.get('/agenda', authenticate, validateQuery(agendaQuerySchema), getAgenda)
router.get('/requests', authenticate, validateQuery(providerRequestsQuerySchema), getProviderRequests)
router.get('/agenda-blocks', authenticate, getAgendaBlocks)
router.post('/agenda-blocks', authenticate, validate(agendaBlockSchema), postAgendaBlock)
router.delete('/agenda-blocks/:blockId', authenticate, validateParams(agendaBlockParamsSchema), removeAgendaBlock)

router.get('/:providerServiceId/profile', authenticate, validateParams(providerServiceIdSchema), getPublicProfile)

router.get('/:providerServiceId', authenticate, validateParams(providerServiceIdSchema), getProviderServiceById)

router.get('/', authenticate, getProviderServices)

router.patch('/:providerServiceId', authenticate, validateParams(providerServiceIdSchema), validate(updateProviderServiceSchema), updateProviderService)

router.delete('/:providerServiceId', authenticate, validateParams(providerServiceIdSchema), removeProviderService)



export default router
