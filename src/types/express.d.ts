import { AuthUser, Role } from '../modules/auth/user.types'

declare global {
    namespace Express {
    interface User{
        id:string
        role: Role
        email?:string
        name?:string
    }
    interface Request{
        user: AuthUser
    }
}
}
export {}