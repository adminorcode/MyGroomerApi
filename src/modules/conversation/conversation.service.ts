import { getPool } from "../../config/database.config";
import { logger } from "../../config/logger.config";
import { Conversation, CreateConversationInput, CreateMessageInput, Message, UpdateMessageInput } from "./conversation.types";
import { QueryType } from "../../types/pagination.types";
import { findBookingById } from "../booking/booking.service";
import { findProviderByUserId } from "../provider/provider.service";
import { AppError } from "../../shared/errors";


export const insertConversation = async (conversationInput:CreateConversationInput):Promise<Conversation | null>=>{
    try {
        const pool = getPool()
        const result = await pool.query(
            `
            INSERT INTO conversations (booking_id, customer_id, provider_id)
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [
                conversationInput.booking_id,
                conversationInput.customer_id,
                conversationInput.provider_id
            ]
        )

        return result.rows[0] || null
    } catch (error) {
        logger.error('insertConversation error', { error })
        throw error
    }
}

export const findConversationById = async (conversationId:string):Promise<Conversation | null> => {
    try {
        const pool = getPool()
        const result = await pool.query(
            `
            SELECT * FROM conversations WHERE id=$1
            `, [conversationId]
        )
        return result.rows[0] || null
    } catch (error) {
        logger.error('findConversationById error', { error })
        throw error
    }
}

export const findConversationByBookingId = async(bookingId:string):Promise<Conversation | null> => {
    try {
        const pool = getPool()
        const result = await pool.query(
            `
            SELECT * FROM conversations WHERE booking_id=$1
            `, [bookingId]
        )
        return result.rows[0] || null
    } catch (error) {
        logger.error('findConversationByBookingId error', { error })
        throw error
    }
}

export const findConversationsBetweenUsers = async(customerId:string, providerId:string):Promise<Conversation[]> => {
    try {
        const pool = getPool()
        const result = await pool.query(
            `
            SELECT * FROM conversations WHERE customer_id=$1 AND provider_id=$2
            `, [customerId, providerId]
        )
        return result.rows
    } catch (error) {
        logger.error('findConversationsBetweenUsers error', { error })
        throw error
    }
}


export const fetchUserConversations = async(query:QueryType, userId:string):Promise<Conversation[]>=>{
    try {
        const page = query.page || 1
        const limit = query.limit || 10
        const offset = (page - 1) * limit

        const pool = getPool()
        const result = await pool.query(
            `
            SELECT 
                conversations.*, 
                customer_users.name as customer_name,
                customer_users.profile_picture as customer_profile,
                provider_users.name as provider_name,
                provider_users.profile_picture as provider_profile,
                (
                    SELECT  content FROM messages
                    WHERE  messages.conversation_id = conversations.id
                    ORDER BY created_at DESC LIMIT 1
                ) as last_message,
                (
                    SELECT created_at FROM messages 
                    WHERE messages.conversation_id = conversations.id 
                    ORDER BY created_at DESC LIMIT 1
                ) as last_message_at,
                (
                    SELECT COUNT(*)::int FROM messages
                    WHERE messages.conversation_id = conversations.id
                    AND messages.is_seen = false
                    AND messages.sender_id <> $1
                ) as unread_count
            FROM conversations 
            LEFT JOIN users as customer_users ON conversations.customer_id = customer_users.id
            LEFT JOIN users as provider_users ON conversations.provider_id = provider_users.id
            WHERE customer_id = $1 OR provider_id=$1
            ORDER BY last_message_at DESC NULLS LAST
            LIMIT $2 OFFSET $3
            `,
            [userId, limit, offset]
        )
        return result.rows
    } catch (error) {
        logger.error('fetchUserConversations error', { error })
        throw error
    }
}


export const insertMessage = async(messageInput:CreateMessageInput):Promise<Message | null>=>{
    try {
        const pool = getPool()
        const result = await pool.query(
            `
            INSERT INTO messages (content, conversation_id, sender_id)
            VALUES ($1, $2, $3)
            RETURNING *
            `, 
            [
                messageInput.content,
                messageInput.conversation_id,
                messageInput.sender_id
            ]
        )
        return result.rows[0] || null
    } catch (error) {
        logger.error('insertMessage error', { error })
        throw error
    }
}

export const updateMessage = async(messageInput:UpdateMessageInput, message_id:string):Promise<Message | null>=>{
    try {
        const pool = getPool()

        const fields = []
        const values = []

        let index = 1

        if (messageInput.content){
            fields.push(`content = $${index++}`)
            values.push(messageInput.content)
            fields.push(`is_edited = true`) 
        }

        if (messageInput.is_seen){
            fields.push(`is_seen = $${index++}`)
            values.push(messageInput.is_seen)
        }

        fields.push(`updated_at=NOW()`)
        values.push(message_id)

        const result = await pool.query(
            `
            UPDATE messages
            SET ${fields.join(', ')}
            WHERE id=$${index}
            RETURNING *
            `,
            values
        )
        return result.rows[0]
    } catch (error) {
        logger.error('updateMessage error', { error })
        throw error
    }
}

export const markMessagesSeen = async (conversationId: string, userId: string): Promise<number> => {
    try {
        const pool = getPool()
        const result = await pool.query(
            `
            UPDATE messages
            SET is_seen = true, updated_at = NOW()
            WHERE conversation_id = $1
              AND sender_id <> $2
              AND is_seen = false
            `,
            [conversationId, userId]
        )
        return result.rowCount ?? 0
    } catch (error) {
        logger.error('markMessagesSeen error', { error })
        throw error
    }
}


export const fetchMessages = async(query:{cursor_time?:Date, cursor_id?:string, limit:number}, conversationId?:string):Promise<Message[]> => {
    try {

        const values = []
        const conditions = []
        let index = 1
        
        if(conversationId){
            conditions.push(`conversation_id=$${index++}`)
            values.push(conversationId)
        }

        if(query.cursor_time && query.cursor_id){
            const timePlaceholder = index++ // e.g. 2
            const idPlaceholder = index++ // e.g. 3
            conditions.push(`(created_at < $${timePlaceholder} OR (created_at = $${timePlaceholder} AND id < $${idPlaceholder}))`)
            values.push(query.cursor_time)
            values.push(query.cursor_id)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        
        const limit = query.limit || 10
        values.push(limit)
         
        const pool = getPool()
        const result = await pool.query(
            `
            SELECT * FROM messages
            ${whereClause}
            ORDER BY created_at DESC, id DESC
            LIMIT $${index}
            `,
            values
        )
        return result.rows || null
    } catch (error) {
        logger.error('fetchMessages error', { error })
        throw error
    }
}

export const requireConversationMember = async (conversationId: string, userId: string) => {
    const conversation = await findConversationById(conversationId)
    if (!conversation || (conversation.customer_id !== userId && conversation.provider_id !== userId)) {
        throw new Error('You are not part of this conversation')
    }
    return conversation
}

export const sendConversationMessage = async (conversationId: string, senderId: string, content: string) => {
    const conversation = await requireConversationMember(conversationId, senderId)
    const message = await insertMessage({ content, conversation_id: conversationId, sender_id: senderId })
    return { conversation, message }
}

export const markConversationSeen = async (conversationId: string, userId: string) => {
    const conversation = await requireConversationMember(conversationId, userId)
    const updated = await markMessagesSeen(conversationId, userId)
    return { conversation, updated }
}

export const openConversation = async (userId: string, providerId: string, bookingId?: string) => {
    if (providerId === userId || !await findProviderByUserId(providerId)) {
        throw new AppError('Groomer da conversa inválido', 400)
    }
    if (bookingId) {
        const existingBooking = await findBookingById(bookingId)
        if (!existingBooking) throw new AppError('Agendamento não encontrado', 404)
        if (existingBooking.customer_id !== userId || existingBooking.provider_user_id !== providerId) {
            throw new AppError('Você não participa deste agendamento', 403)
        }
    }
    const existingConvo = await findConversationsBetweenUsers(userId, providerId)
    if (existingConvo.length > 0) return { created: false as const, conversation: existingConvo[0] }
    const conversation = await insertConversation({ booking_id: bookingId, customer_id: userId, provider_id: providerId })
    return { created: true as const, conversation }
}

export const listConversationsForUser = async (userId: string, query: QueryType) => (
    fetchUserConversations(query, userId)
)

export const listMessagesForMember = async (
    userId: string,
    conversationId: string,
    query: { cursor_time?: Date, cursor_id?: string, limit: number },
) => {
    const conversation = await findConversationById(conversationId)
    if (!conversation) throw new AppError('Conversa não encontrada', 404)
    if (conversation.customer_id !== userId && conversation.provider_id !== userId) {
        throw new AppError('Você não participa desta conversa', 403)
    }
    return fetchMessages(query, conversationId)
}

export const markConversationReadForMember = async (userId: string, conversationId: string) => {
    const conversation = await findConversationById(conversationId)
    if (!conversation) throw new AppError('Conversa não encontrada', 404)
    if (conversation.customer_id !== userId && conversation.provider_id !== userId) {
        throw new AppError('Você não participa desta conversa', 403)
    }
    const updated = await markMessagesSeen(conversationId, userId)
    return { updated }
}