import { Request, Response } from "express"
import { AppError } from "../middlewares/errorHandler"
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
    fetchProviderTransactions
} from "../services/provider.service"
import { QueryType } from "../types/pagination.types"
import { CreateProvider, CreateProviderService, PayoutMethod } from "../types/provider.types"
import { updateUser } from "../services/user.service"
import { Role } from "../types/user.types"
import { generateJwtToken } from "../utils/jwt.utils"


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

    res.status(200).json({
        success: true,
        data: providerService
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

    // default to the authenticated user's own provider services when no providerId is given
    let providerIdToUse = providerId as string | undefined

    if (!providerIdToUse) {
        const provider = await findProviderByUserId(req.user.id)
        if (!provider) {
            throw new AppError('Perfil do groomer não encontrado', 404)
        }
        providerIdToUse = provider.id
    }

    const providerServices = await fetchProviderServices(
        providerIdToUse,
        query
    )

    res.status(200).json({
        success: true,
        data: providerServices
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
    
    const createdProvider = await insertProvider({
        user_id: user.id,
        ...providerData
    })

    if (!createdProvider) {
        throw new AppError('Não foi possível concluir o cadastro de groomer', 500)
    }

    // update user role
    const update = await updateUser(user.id, {role: Role.PROVIDER})

    if(!update){
        throw new AppError('Não foi possível atualizar o perfil', 500)
    }

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

    const transactions = await fetchProviderTransactions(req.user.id)
    
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
