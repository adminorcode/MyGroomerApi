import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import type { ConversationIdParamSchema, PaginationQuerySchema } from './conversation.schemas'
import {
    listConversationsForUser,
    listMessagesForMember,
    markConversationReadForMember,
    openConversation,
} from './conversation.service'

export const createConversation = async (req: Request, res: Response) => {
    const user = req.user
    const { booking_id, provider_id } = req.body
    if (!user) throw new AppError('Não autenticado', 401)

    const result = await openConversation(user.id, provider_id, booking_id)
    if (!result.created) {
        res.status(200).json({
            success: true,
            message: 'A conversa já existe',
            data: result.conversation,
        })
        return
    }
    res.status(201).json({ success: true, message: 'Conversa criada com sucesso', data: result.conversation })
}

export const getUserConversations = async (req: Request, res: Response) => {
    const user = req.user
    const { limit, page } = req.query as unknown as PaginationQuerySchema
    if (!user) throw new AppError('Não autorizado', 401)
    const convos = await listConversationsForUser(user.id, { limit, page })
    res.status(200).json({ success: true, message: 'Conversas carregadas', data: convos })
}

export const getConversationMessages = async (req: Request, res: Response) => {
    const { conversationId } = req.params as unknown as ConversationIdParamSchema
    const { cursor_time, cursor_id, limit } = req.query as unknown as PaginationQuerySchema
    const user = req.user
    if (!user) throw new AppError('Não autenticado', 401)
    const convoMessages = await listMessagesForMember(user.id, conversationId, { limit, cursor_time, cursor_id })
    res.status(200).json({ success: true, message: 'Mensagens carregadas', data: convoMessages })
}

export const markConversationRead = async (req: Request, res: Response) => {
    const { conversationId } = req.params as unknown as ConversationIdParamSchema
    const user = req.user
    if (!user) throw new AppError('Não autenticado', 401)
    const { updated } = await markConversationReadForMember(user.id, conversationId)
    res.status(200).json({ success: true, message: 'Conversa marcada como lida', data: { updated } })
}
