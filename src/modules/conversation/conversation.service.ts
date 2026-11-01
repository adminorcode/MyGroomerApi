import { SQL } from 'drizzle-orm'
import { logger } from '../../config/logger.config'
import { col, execute, sql } from '../../shared/db/drizzle'
import { Conversation, CreateConversationInput, CreateMessageInput, Message, UpdateMessageInput } from './conversation.types'
import { conversations, messages } from './conversation.table'
import { QueryType } from '../../types/pagination.types'
import { findBookingById } from '../booking/booking.service'
import { findProviderByUserId } from '../provider/provider.service'
import { AppError } from '../../shared/errors'

export const insertConversation = async (conversationInput: CreateConversationInput): Promise<Conversation | null> => {
    try {
        const result = await execute<Conversation>(undefined, sql`
            INSERT INTO ${conversations} (booking_id, customer_id, provider_id)
            VALUES (${conversationInput.booking_id ?? null}, ${conversationInput.customer_id}, ${conversationInput.provider_id})
            RETURNING *
        `)
        return result.rows[0] || null
    } catch (error) {
        logger.error('insertConversation error', { error })
        throw error
    }
}

export const findConversationById = async (conversationId: string): Promise<Conversation | null> => {
    try {
        const result = await execute<Conversation>(undefined, sql`
            SELECT * FROM ${conversations} WHERE ${conversations.id} = ${conversationId}
        `)
        return result.rows[0] || null
    } catch (error) {
        logger.error('findConversationById error', { error })
        throw error
    }
}

export const findConversationByBookingId = async (bookingId: string): Promise<Conversation | null> => {
    try {
        const result = await execute<Conversation>(undefined, sql`
            SELECT * FROM ${conversations} WHERE ${conversations.booking_id} = ${bookingId}
        `)
        return result.rows[0] || null
    } catch (error) {
        logger.error('findConversationByBookingId error', { error })
        throw error
    }
}

export const findConversationsBetweenUsers = async (customerId: string, providerId: string): Promise<Conversation[]> => {
    try {
        const result = await execute<Conversation>(undefined, sql`
            SELECT * FROM ${conversations}
            WHERE ${conversations.customer_id} = ${customerId} AND ${conversations.provider_id} = ${providerId}
        `)
        return result.rows
    } catch (error) {
        logger.error('findConversationsBetweenUsers error', { error })
        throw error
    }
}

export const fetchUserConversations = async (query: QueryType, userId: string): Promise<Conversation[]> => {
    try {
        const page = query.page || 1
        const limit = query.limit || 10
        const offset = (page - 1) * limit
        const result = await execute<Conversation>(undefined, sql`
            SELECT
                ${conversations}.*,
                customer_users.name as customer_name,
                customer_users.profile_picture as customer_profile,
                provider_users.name as provider_name,
                provider_users.profile_picture as provider_profile,
                (
                    SELECT content FROM ${messages}
                    WHERE ${messages.conversation_id} = ${conversations.id}
                    ORDER BY created_at DESC LIMIT 1
                ) as last_message,
                (
                    SELECT created_at FROM ${messages}
                    WHERE ${messages.conversation_id} = ${conversations.id}
                    ORDER BY created_at DESC LIMIT 1
                ) as last_message_at,
                (
                    SELECT COUNT(*)::int FROM ${messages}
                    WHERE ${messages.conversation_id} = ${conversations.id}
                    AND ${messages.is_seen} = false
                    AND ${messages.sender_id} <> ${userId}
                ) as unread_count
            FROM ${conversations}
            LEFT JOIN users as customer_users ON ${conversations.customer_id} = customer_users.id
            LEFT JOIN users as provider_users ON ${conversations.provider_id} = provider_users.id
            WHERE ${conversations.customer_id} = ${userId} OR ${conversations.provider_id} = ${userId}
            ORDER BY last_message_at DESC NULLS LAST
            LIMIT ${limit} OFFSET ${offset}
        `)
        return result.rows
    } catch (error) {
        logger.error('fetchUserConversations error', { error })
        throw error
    }
}

export const insertMessage = async (messageInput: CreateMessageInput): Promise<Message | null> => {
    try {
        const result = await execute<Message>(undefined, sql`
            INSERT INTO ${messages} (content, conversation_id, sender_id)
            VALUES (${messageInput.content}, ${messageInput.conversation_id}, ${messageInput.sender_id})
            RETURNING *
        `)
        return result.rows[0] || null
    } catch (error) {
        logger.error('insertMessage error', { error })
        throw error
    }
}

export const updateMessage = async (messageInput: UpdateMessageInput, message_id: string): Promise<Message | null> => {
    try {
        const assignments: SQL[] = []
        if (messageInput.content) {
            assignments.push(sql`${col(messages.content)} = ${messageInput.content}`)
            assignments.push(sql`${col(messages.is_edited)} = true`)
        }
        if (messageInput.is_seen) assignments.push(sql`${col(messages.is_seen)} = ${messageInput.is_seen}`)
        assignments.push(sql`${col(messages.updated_at)} = NOW()`)
        const result = await execute<Message>(undefined, sql`
            UPDATE ${messages}
            SET ${sql.join(assignments, sql`, `)}
            WHERE ${messages.id} = ${message_id}
            RETURNING *
        `)
        return result.rows[0]
    } catch (error) {
        logger.error('updateMessage error', { error })
        throw error
    }
}

export const markMessagesSeen = async (conversationId: string, userId: string): Promise<number> => {
    try {
        const result = await execute(undefined, sql`
            UPDATE ${messages}
            SET ${col(messages.is_seen)} = true, ${col(messages.updated_at)} = NOW()
            WHERE ${messages.conversation_id} = ${conversationId}
              AND ${messages.sender_id} <> ${userId}
              AND ${messages.is_seen} = false
        `)
        return result.rowCount ?? 0
    } catch (error) {
        logger.error('markMessagesSeen error', { error })
        throw error
    }
}

export const fetchMessages = async (query: { cursor_time?: Date, cursor_id?: string, limit: number }, conversationId?: string): Promise<Message[]> => {
    try {
        const conditions: SQL[] = []
        if (conversationId) conditions.push(sql`${messages.conversation_id} = ${conversationId}`)
        if (query.cursor_time && query.cursor_id) {
            conditions.push(sql`(
                ${messages.created_at} < ${query.cursor_time}
                OR (${messages.created_at} = ${query.cursor_time} AND ${messages.id} < ${query.cursor_id})
            )`)
        }
        const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``
        const limit = query.limit || 10
        const result = await execute<Message>(undefined, sql`
            SELECT * FROM ${messages}
            ${whereClause}
            ORDER BY ${messages.created_at} DESC, ${messages.id} DESC
            LIMIT ${limit}
        `)
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
