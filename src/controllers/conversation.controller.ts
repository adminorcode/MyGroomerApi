import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import { findBookingById } from "../services/booking.service";
import { fetchMessages, fetchUserConversations, findConversationById, findConversationsBetweenUsers, insertConversation, markMessagesSeen } from "../services/conversation.service";
import { Booking } from "../types/booking.types";
import type { ConversationIdParamSchema, PaginationQuerySchema } from "../validators/conversation.validator";
import { findProviderByUserId } from '../services/provider.service';


export const createConversation = async(req:Request, res:Response) => {
    const user = req.user
    const { booking_id, provider_id } = req.body
    
    if(!user) throw new AppError('Não autenticado', 401)

    if (provider_id === user.id || !await findProviderByUserId(provider_id)) {
        throw new AppError('Groomer da conversa inválido', 400)
    }

    let existingBooking:Booking | null

    if(booking_id){
        // find if booking exists
        existingBooking = await findBookingById(booking_id)
        
        if(!existingBooking){
            throw new AppError('Agendamento não encontrado', 404)
        }
        if (existingBooking.customer_id !== user.id || existingBooking.provider_user_id !== provider_id) {
            throw new AppError('Você não participa deste agendamento', 403)
        }
    }

    const existingConvo = await findConversationsBetweenUsers(user.id, provider_id)
    if (existingConvo.length > 0) {
        return res.status(200).json({ 
            success: true, 
            message: 'A conversa já existe', 
            data: existingConvo[0] 
        })
    }

    const conversation = await insertConversation({
        booking_id,
        customer_id: user.id,
        provider_id
    })

    res.status(201).json({success:true, message:'Conversa criada com sucesso', data:conversation})
}

export const getUserConversations = async(req:Request, res:Response) => {
    const user = req.user
    const { limit, page } = req.query as unknown as PaginationQuerySchema
    if (!user) throw new AppError('Não autorizado', 401)

    const convos = await fetchUserConversations({ limit, page }, user.id)

    res.status(200).json({success:true, message:'Conversas carregadas', data:convos})
}

export const getConversationMessages = async(req:Request, res:Response) => {
    const { conversationId } = req.params as unknown as ConversationIdParamSchema
    const { cursor_time, cursor_id, limit } = req.query as unknown as PaginationQuerySchema
    const user = req.user

    if(!user) throw new AppError('Não autenticado', 401)

    const conversation = await findConversationById(conversationId)
    if (!conversation) throw new AppError('Conversa não encontrada', 404)
    
    if (conversation.customer_id !== user.id && conversation.provider_id !== user.id) {
        throw new AppError('Você não participa desta conversa', 403)
    }
    
    const convoMessages = await fetchMessages({ limit, cursor_time, cursor_id }, conversationId)

    res.status(200).json({success:true, message:'Mensagens carregadas', data:convoMessages})
} 

export const markConversationRead = async (req: Request, res: Response) => {
    const { conversationId } = req.params as unknown as ConversationIdParamSchema
    const user = req.user
    if (!user) throw new AppError('Não autenticado', 401)

    const conversation = await findConversationById(conversationId)
    if (!conversation) throw new AppError('Conversa não encontrada', 404)
    if (conversation.customer_id !== user.id && conversation.provider_id !== user.id) {
        throw new AppError('Você não participa desta conversa', 403)
    }

    const updated = await markMessagesSeen(conversationId, user.id)
    res.status(200).json({ success: true, message: 'Conversa marcada como lida', data: { updated } })
}
