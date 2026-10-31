import { CreateProvider } from '../provider/provider.types'
import { RegistrationDetails } from '../provider/registration.schemas'

export enum Role {
    PROVIDER = 'provider',
    CUSTOMER = 'customer',
    ADMIN = 'admin'
}

export interface User{
    id: string;
    name: string;
    email: string;
    password?:string
    role:Role;
    phone_number?:string;
    address?:string;
    profile_picture?:string
    created_at:Date
    updated_at:Date
    is_online?:boolean
    google_id?:string
    email_verification_token?:string
    email_verified_at?:Date
    forgot_password_token?:string
    email_verification_token_expires_at?:Date
    forgot_password_token_expires_at?:Date
    terms_accepted_at?:Date
}


export type AuthUser = {
    id: string
    role: Role
    name: string
    email: string
  }


export type CreateUserInput = {
    name:string
    email:string
    password?:string
    role:Role
    address?:string
    profile_picture?:string
    google_id?:string
    phone_number?:string
    terms_accepted_at?:Date
    email_verification_token?:string
    email_verification_token_expires_at?:Date
    email_verified_at?:Date
}

type RegisterBase = {
    name: string
    email: string
    password: string
    phone_number?: string
    accepted_terms?: boolean
    address?: string
    profile_picture?: string
}

export type RegisterCustomerInput = RegisterBase & {
    role?: Role.CUSTOMER | Role.ADMIN
}

export type RegisterProviderInput = RegisterBase & {
    role: Role.PROVIDER
    registration?: RegistrationDetails
} & Omit<CreateProvider, 'user_id'>

export type RegisterInput = RegisterCustomerInput | RegisterProviderInput
