import { Role, User } from "../../modules/auth/user.types"
import jwt from "jsonwebtoken"

type JwtPayload = {
    id:string
    role:Role
    name?:string
    email?:string
}


export const generateJwtToken =(payload:JwtPayload):string=>{
    const token = jwt.sign(payload,process.env.JWT_SECRET!, {expiresIn: '7d'})
    return token
}

export const verifyToken = (token:string):JwtPayload=>{
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!)
        return payload as JwtPayload
    } catch (_) {
        throw new Error('Invalid or expired token')
    }
}