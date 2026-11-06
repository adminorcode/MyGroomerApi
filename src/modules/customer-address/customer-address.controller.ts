import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { Role } from '../auth/user.types'
import {
    CreateCustomerAddressSchema,
    UpdateCustomerAddressSchema,
} from './customer-address.schemas'
import {
    deleteCustomerAddress,
    insertCustomerAddress,
    listCustomerAddresses,
    updateCustomerAddress,
} from './customer-address.service'

const requireTutor = (req: Request) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    if (req.user.role !== Role.CUSTOMER) {
        throw new AppError('Só o tutor cadastra endereços de atendimento.', 403)
    }
    return req.user
}

const complementOf = (value: string | null | undefined) => value ?? null

export const getCustomerAddresses = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const addresses = await listCustomerAddresses(user.id)
    res.status(200).json({ success: true, data: addresses })
}

export const postCustomerAddress = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const body = req.body as CreateCustomerAddressSchema
    const created = await insertCustomerAddress(user.id, {
        label: body.label,
        address: body.address,
        complement: complementOf(body.complement),
        latitude: body.latitude,
        longitude: body.longitude,
        is_default: body.is_default,
    })
    res.status(201).json({ success: true, data: created })
}

export const patchCustomerAddress = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const body = req.body as UpdateCustomerAddressSchema
    const updated = await updateCustomerAddress(req.params.id as string, user.id, {
        label: body.label,
        address: body.address,
        complement: body.complement,
        latitude: body.latitude,
        longitude: body.longitude,
        is_default: body.is_default,
    })
    if (!updated) throw new AppError('Endereço não encontrado', 404)
    res.status(200).json({ success: true, data: updated })
}

export const removeCustomerAddress = async (req: Request, res: Response) => {
    const user = requireTutor(req)
    const replacementId = (req.query as { replacement_id?: string }).replacement_id
    const removed = await deleteCustomerAddress(req.params.id as string, user.id, replacementId)
    if (!removed) throw new AppError('Endereço não encontrado', 404)
    res.status(204).send()
}
