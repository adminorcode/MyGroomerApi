import { Request, Response } from "express"
import { z } from "zod"
import { AppError } from "../../shared/errors"
import {
    deleteProviderService,
    insertProvider,
    insertProviderService,
    fetchProviderServices,
    fetchServiceProviders,
    modifyProviderService,
    findProviderByUserId,
    findProviderServiceById,
    findProviderServiceByIdWithProviderDetails,
    findPublicProfileByOfferId,
    fetchProvidersByCoverage,
} from "./provider.service"
import { readProviderMenu, saveProviderMenu as writeProviderMenu } from "./provider-menu.service"
import { SaveMenuOffer } from "./provider.schemas"
import { listProviderPayouts } from '../payout/payout.service'
import { hasBookingsForProviderService } from '../booking/booking.service'
import { withTransaction } from '../../shared/db/transaction'
import { resolveCoverageAddress } from "./coverage.geo"
import { CoverageSearchQuery } from "./provider.schemas"
import { QueryType } from "../../types/pagination.types"
import { CreateProvider, CreateProviderService, PayoutMethod } from "./provider.types"
import { assignProviderRole } from '../auth/auth.service'
import { Role } from '../auth/user.types'
import { generateJwtToken } from '../../shared/auth/jwt'


// Create a Provider Service
export const createProviderService = async (req: Request, res: Response) => {
    const providerServiceData: Omit<CreateProviderService, 'provider_id'> = req.body

    if(!req.user){
        throw new AppError('Não autorizado', 401)
    }

    if (!providerServiceData.service_id || providerServiceData.price === undefined) {
        throw new AppError('Campos obrigatórios ausentes', 400)
    }

    const provider = await findProviderByUserId(req.user.id)

    if(!provider){
        throw new AppError('Perfil do groomer não encontrado', 404)
    }

    const createdProviderService = await insertProviderService(provider.id, providerServiceData)

    res.status(201).json({
        success: true,
        data: createdProviderService
    })
}

// Get a Provider Service by ID
export const getProviderServiceById = async (req: Request, res: Response) => {
    const { providerServiceId } = req.params

    if (!providerServiceId || typeof providerServiceId !== 'string') {
        throw new AppError('Identificador inválido', 400)
    }

    const providerService = await findProviderServiceByIdWithProviderDetails(providerServiceId)

    if (!providerService) {
        throw new AppError('Serviço do groomer não encontrado', 404)
    }

    if (providerService.is_active === false) {
        const owner = req.user ? await findProviderByUserId(req.user.id) : null
        if (!owner || owner.id !== providerService.provider_id) {
            throw new AppError('Serviço do groomer não encontrado', 404)
        }
    }

    res.status(200).json({
        success: true,
        data: providerService
    })
}

export const getPublicProfile = async (req: Request, res: Response) => {
    const { providerServiceId } = req.params

    if (!providerServiceId || typeof providerServiceId !== 'string' || !z.uuid().safeParse(providerServiceId).success) {
        throw new AppError('Identificador inválido', 400)
    }

    const profile = await findPublicProfileByOfferId(providerServiceId, req.user?.id)

    if (!profile) {
        throw new AppError('Perfil do profissional não encontrado', 404)
    }

    res.status(200).json({
        success: true,
        data: profile,
    })
}

// Get Provider Services (with pagination/search)
export const getProviderServices = async (req: Request, res: Response) => {
    if (!req.user) {
        throw new AppError('Não autorizado', 401)
    }

    const { providerId } = req.query
    const query: QueryType = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 10
    }

    const owner = await findProviderByUserId(req.user.id)
    let providerIdToUse = providerId as string | undefined

    if (!providerIdToUse) {
        if (!owner) {
            throw new AppError('Perfil do groomer não encontrado', 404)
        }
        providerIdToUse = owner.id
    }

    const providerServices = await fetchProviderServices(
        providerIdToUse,
        query,
        owner?.id === providerIdToUse,
    )

    res.status(200).json({
        success: true,
        data: providerServices
    })
}

export const getProviderMenu = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const provider = await findProviderByUserId(req.user.id)
    if (!provider) throw new AppError('Perfil do groomer não encontrado', 404)
    const menu = await readProviderMenu(provider.id)
    res.status(200).json({ success: true, data: menu })
}

export const saveProviderMenu = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const provider = await findProviderByUserId(req.user.id)
    if (!provider) throw new AppError('Perfil do groomer não encontrado', 404)
    const offers = (req.body as { offers: SaveMenuOffer[] }).offers
    const menu = await writeProviderMenu(provider.id, offers)
    res.status(200).json({ success: true, data: menu })
}

export const searchCoverage = async (req: Request, res: Response) => {
    const query = req.query as unknown as CoverageSearchQuery
    const latitude = query.latitude
    const longitude = query.longitude
    const resolved = latitude === undefined || longitude === undefined
        ? resolveCoverageAddress(query.address)
        : { latitude, longitude, label: query.address }

    if (!resolved) {
        throw new AppError('Não foi possível localizar este endereço.', 400)
    }

    const providers = await fetchProvidersByCoverage({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        serviceId: query.service_id,
        categoryId: query.category_id,
    })

    res.status(200).json({
        success: true,
        data: {
            address: query.address,
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            providers,
        },
    })
}

// Get All Providers for a specific Service
export const getServiceProviders = async (req: Request, res: Response) => {
    const { serviceId } = req.params

    if (!serviceId || typeof serviceId !== 'string') {
        throw new AppError('Serviço inválido', 400)
    }

    const providers = await fetchServiceProviders(serviceId)

    res.status(200).json({
        success: true,
        data: providers
    })
}

// Update a Provider Service
export const updateProviderService = async (req: Request, res: Response) => {
    if(!req.user){
        throw new AppError('Não autorizado', 401)
    }

    const provider = await findProviderByUserId(req.user.id)

    if(!provider){
        throw new AppError('Groomer não encontrado', 404)
    }

    const { providerServiceId } = req.params
    const updateData: CreateProviderService = req.body

    if (!providerServiceId || typeof providerServiceId !== 'string') {
        throw new AppError('Identificador inválido', 400)
    }

    const existing = await findProviderServiceById(providerServiceId)
    if (!existing) throw new AppError('Serviço do groomer não encontrado', 404)

    // check if the provider is the owner of the service
    if(existing.provider_id !== provider.id){
        throw new AppError('Não autorizado', 401)
    }

    const updated = await modifyProviderService(
        providerServiceId, 
        existing.service_id,
        updateData
    )

    res.status(200).json({
        success: true,
        data: updated
    })
}

export const removeProviderService = async(req:Request, res:Response) => {
    const {providerServiceId} = req.params

    if(!providerServiceId || typeof providerServiceId != 'string'){
        throw new AppError('Identificador inválido', 400)
    }

    if (!req.user) throw new AppError('Não autorizado', 401)
    const provider = await findProviderByUserId(req.user.id)
    const existing = await findProviderServiceById(providerServiceId)
    if (!existing) throw new AppError('Serviço do groomer não encontrado', 404)
    if (!provider || provider.id !== existing.provider_id) throw new AppError('Este serviço não é seu', 403)
    if (await hasBookingsForProviderService(providerServiceId)) {
        throw new AppError('This service has bookings and cannot be deleted', 409)
    }
    const result = await deleteProviderService(providerServiceId)

    if(!result){
        throw new AppError('Serviço do groomer não encontrado', 404)
    }

    res.status(200).json({
        success:true,
        message:'Serviço removido'
    })
}

export const registerAsProvider = async (req: Request, res: Response) => {
    const user = req.user
    const providerData: Omit<CreateProvider, 'user_id'> = req.body

    if (!user) {
        throw new AppError('Não autorizado', 401)
    }
    
    const existingProvider = await findProviderByUserId(user.id)
    if (existingProvider) {
        throw new AppError('Você já está cadastrado como groomer', 409)
    }

    if (!providerData.payout_method) {
        throw new AppError('Campos obrigatórios ausentes', 400)
    }

    if (providerData.payout_method === PayoutMethod.MOBILE_MONEY) {
        if (!providerData.momo_number || !providerData.momo_provider) {
            throw new AppError('Informe o número e a operadora do dinheiro móvel', 400)
        }
    } else if (providerData.payout_method === PayoutMethod.BANK) {
        if (!providerData.bank_account_name || !providerData.bank_account_number) {
            throw new AppError('Informe o nome e o número da conta bancária', 400)
        }
    }
    
    const createdProvider = await withTransaction(async (client) => {
        const created = await insertProvider({
            user_id: user.id,
            ...providerData,
        }, client)
        if (!created) throw new AppError('Não foi possível concluir o cadastro de groomer', 500)
        const update = await assignProviderRole(user.id, client)
        if (!update) throw new AppError('Não foi possível atualizar o perfil', 500)
        return created
    })

    // update jwt token provided for authenticated user
    const payload = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: Role.PROVIDER
    }
    const token = generateJwtToken(payload)

    res.status(201).json({
        success: true,
        data: createdProvider,
        token
    })
}

export const getProviderEarnings = async (req:Request, res:Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)

    const transactions = await listProviderPayouts(req.user.id)
    
    const totalEarned = transactions
        .filter(t => t.transaction_status === 'completed')
        .reduce((sum, t) => sum + Number(t.amount), 0)
    
    const pending = transactions
        .filter(t => t.transaction_status === 'pending')
        .reduce((sum, t) => sum + Number(t.amount), 0)
    
    res.status(200).json({
        success: true,
        data: { totalEarned, pending, transactions }
    })
}
