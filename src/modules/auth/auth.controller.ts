import { Request, Response } from "express";
import { forgotPassword, loginUser, registerUser, resetUserPassword, verifyEmail } from "./auth.service";
import { generateJwtToken } from "../../shared/auth/jwt";
import { Role, User } from "./user.types";


export const register = async (req:Request, res:Response) => {
    const result = await registerUser(req.body)
    res.status(201).json(result)
}

export const verify = async (req:Request, res:Response) => {
    const { token } = req.body
    const result = await verifyEmail(token)
    res.status(200).json(result)
}

export const login = async (req:Request, res:Response) => {
    const {email, password} = req.body
    const result = await loginUser(email, password)
    res.status(200).json(result)
}

export const userForgotPassword = async (req:Request, res:Response) => {
    const email = req.body.email
    const result = await forgotPassword(email)
    res.status(200).json(result)
}

export const passwordReset = async (req:Request, res:Response) => {
    const {password,token} = req.body
    const result = await resetUserPassword(token, password)
    res.status(200).json(result)
}

export const googleAuthCallback = async (req:Request, res:Response) => {
    const {id, name, email, role} = req.user as User
    const payload = {
        id,
        name,
        role,
        email
    }
    const token = generateJwtToken(payload)

    res.redirect(`boame://auth/callback?token=${token}`)
}