export interface Conversation {
    id: string
    booking_id?: string
    customer_id: string
    provider_id: string
    last_message:string | null
    last_message_at:Date | null
    unread_count:number
    created_at: Date
    updated_at: Date
}

export interface Message {
    id: string
    content: string
    conversation_id: string
    is_edited:boolean
    sender_id: string
    timestamp: Date
    is_seen: boolean
    created_at: Date
    updated_at: Date
}

    export type CreateConversationInput = {
    booking_id?: string
    customer_id: string
    provider_id: string
}

export type CreateMessageInput = {
    content: string
    conversation_id: string
    sender_id: string
}

export type UpdateMessageInput = {
    content?: string
    conversation_id?: string
    is_seen?:boolean
}