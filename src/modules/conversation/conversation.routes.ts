import { Router } from 'express'
import { authenticate } from '../../shared/http/auth.middleware'
import { validate, validateParams, validateQuery } from '../../shared/http/validate.middleware'
import {
    createConversation,
    getConversationMessages,
    getUserConversations,
    markConversationRead,
} from './conversation.controller'
import { conversationIdParamSchema, createConversationSchema, paginationQuerySchema } from './conversation.schemas'

const router = Router()

router.post('/', authenticate, validate(createConversationSchema), createConversation)
router.get('/', authenticate, validateQuery(paginationQuerySchema), getUserConversations)
router.get(
    '/:conversationId/messages',
    authenticate,
    validateParams(conversationIdParamSchema),
    validateQuery(paginationQuerySchema),
    getConversationMessages,
)
router.patch(
    '/:conversationId/read',
    authenticate,
    validateParams(conversationIdParamSchema),
    markConversationRead,
)

export default router
