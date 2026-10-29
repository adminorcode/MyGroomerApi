import { Server } from 'socket.io'
import { Server as HttpServer } from 'http'
import { z } from 'zod'
import { logger } from './logger.config'
import { verifyToken } from '../shared/auth/jwt'
import {
    fetchUserConversations,
    markConversationSeen,
    requireConversationMember,
    sendConversationMessage,
} from '../modules/conversation/conversation.service'

const conversationInput = z.object({ conversation_id: z.uuid() })
const messageInput = conversationInput.extend({ content: z.string().trim().min(1).max(4000) })
const respond = (ack: unknown, result: unknown) => {
    if (typeof ack === 'function') ack(result)
}

export const initializeSocket = (httpServer: HttpServer) => {
    const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } })
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization
            if (typeof token !== 'string') throw new Error('Authentication required')
            socket.data.user = verifyToken(token.replace(/^Bearer /, ''))
            next()
        } catch {
            next(new Error('Invalid token'))
        }
    })

    io.on('connection', socket => {
        const user = socket.data.user
        socket.join(`user_${user.id}`)
        const fail = (error: unknown, ack?: unknown) => {
            const message = error instanceof Error ? error.message : 'Message operation failed'
            socket.emit('error', { message })
            respond(ack, { success: false, message })
        }
        socket.on('join_conversation', async (data, ack) => {
            try {
                const input = conversationInput.parse(data)
                await requireConversationMember(input.conversation_id, user.id)
                await socket.join(`conversation_${input.conversation_id}`)
                respond(ack, { success: true })
            } catch (error) { fail(error, ack) }
        })
        socket.on('send_message', async (data, ack) => {
            try {
                const input = messageInput.parse(data)
                const { conversation, message } = await sendConversationMessage(input.conversation_id, user.id, input.content)
                io.to(`user_${conversation.customer_id}`).to(`user_${conversation.provider_id}`).emit('new_message', message)
                respond(ack, { success: true, data: message })
            } catch (error) { fail(error, ack) }
        })
        socket.on('message_seen', async (data, ack) => {
            try {
                const input = conversationInput.parse(data)
                const { conversation } = await markConversationSeen(input.conversation_id, user.id)
                io.to(`user_${conversation.customer_id}`).to(`user_${conversation.provider_id}`).emit('message_seen', {
                    conversation_id: input.conversation_id, seen_by: user.id,
                })
                respond(ack, { success: true })
            } catch (error) { fail(error, ack) }
        })
        fetchUserConversations({ page: 1, limit: 100 }, user.id)
            .then(conversations => conversations.forEach(conversation => socket.join(`conversation_${conversation.id}`)))
            .catch(error => logger.error('Could not join conversation rooms', { message: error.message }))
    })
    return io
}
