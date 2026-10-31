import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { Role } from '../auth/user.types'
import {
    insertProfessionalType,
    listProfessionalTypes,
    modifyProfessionalType,
    removeProfessionalType,
} from './professional-type.service'

const IN_USE = 'Não é possível excluir um tipo que já tem profissional ou serviço vinculado'

export const getPublicProfessionalTypes = async (_req: Request, res: Response) => {
    const types = await listProfessionalTypes(false)
    res.json({ success: true, data: types.map(({ id, name }) => ({ id, name })) })
}

export const createProfessionalType = async (req: Request, res: Response) => {
    const created = await insertProfessionalType({ name: req.body.name })
    if (!created) throw new AppError('Não foi possível salvar o tipo', 500)
    res.status(201).json({ success: true, data: created })
}

export const getProfessionalTypes = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const includeInactive = req.query.include_inactive === 'true'
    if (includeInactive && req.user.role !== Role.ADMIN) {
        throw new AppError('A lista com tipos inativos é exclusiva do administrador', 403)
    }
    const types = await listProfessionalTypes(includeInactive)
    res.status(200).json({ success: true, data: types })
}

export const updateProfessionalType = async (req: Request, res: Response) => {
    const updated = await modifyProfessionalType(req.params.typeId as string, {
        name: req.body.name,
        is_active: req.body.is_active,
    })
    if (!updated) throw new AppError('Tipo de profissional não encontrado', 404)
    res.status(200).json({ success: true, data: updated })
}

export const deleteProfessionalType = async (req: Request, res: Response) => {
    const result = await removeProfessionalType(req.params.typeId as string)
    if (result === 'not_found') throw new AppError('Tipo de profissional não encontrado', 404)
    if (result === 'in_use') throw new AppError(IN_USE, 409)
    res.status(200).json({ success: true })
}
