import bcrypt from 'bcrypt'
import { RegisterInput, Role } from '../types/user.types'
import { generateVerificationToken } from '../utils/token.utils'
import { createUser, findUserByEmail, findUserByForgotPasswordToken, findUserByVerificationToken, resetPassword, storeForgotPasswordToken, verifyUserEmail } from './user.service'
import { AppError } from '../middlewares/errorHandler'
import { generateJwtToken } from '../utils/jwt.utils'
import crypto from 'crypto'
import { sendEmailVerificationToken, sendPasswordResetEmail } from '../utils/email.utils'
import { insertProvider } from './provider.service'
import { isLocalTestMode } from '../config/runtime.config'


export const registerUser = async (user:RegisterInput)=>{
    
    try {
        // check if email exists
        const existingEmail = await findUserByEmail(user.email)
        if (existingEmail){
            throw new AppError('Email already in use.', 409)
        }
        // hash password
        const salt = await bcrypt.genSalt(10)
        const hashed_password = await bcrypt.hash(user.password, salt)

        // generate email verification token
        const email_token = generateVerificationToken()

        const createdUser = await createUser({
            ...user,
            role: user.role ?? Role.CUSTOMER,
            password: hashed_password,
            email_verification_token: isLocalTestMode() ? undefined : email_token.token,
            email_verification_token_expires_at: isLocalTestMode() ? undefined : email_token.expiry,
            email_verified_at: isLocalTestMode() ? new Date() : undefined
        })

        // If role is provider, insert provider row
        if (user.role === Role.PROVIDER) {
            await insertProvider({
                user_id: createdUser.id,
                payout_method: user.payout_method,
                momo_number: user.momo_number,
                momo_provider: user.momo_provider,
                bank_account_number: user.bank_account_number,
                bank_account_name: user.bank_account_name,
                bank_code: user.bank_code,
                id_document_url: user.id_document_url,
                service_area: user.service_area
            });
        }

        // send verification email
        await sendEmailVerificationToken(email_token.token, user.email)

        return {success:true, message:'User created successfully', email: user.email, requires_verification: !isLocalTestMode()}
    } catch (error) {
        throw error
    }
}

export const verifyEmail = async (token:string) => {

    try {
        const user = await findUserByVerificationToken(token)
    
        if (!user){
            throw new AppError('User not found!', 404)
        }

        // check if token has expired
        if (!user.email_verification_token_expires_at) {
            throw new AppError('Invalid verification token.', 400)
        }

        const is_token_expired = user.email_verification_token_expires_at < new Date()

        if(is_token_expired){
            throw new AppError('Verification token has expired.', 400)
        }
    
        await verifyUserEmail(user.id)

        return {success:true, message:'Email verified successfully'}
        
    } catch (error) {
        throw error
    }
}

export const loginUser = async (email:string, user_password:string) => {
    try {
        const existingUser = await findUserByEmail(email)

        if (!existingUser){
            throw new AppError('Invalid email or password', 401)
        }

        if (!existingUser.email_verified_at){
            throw new AppError('Please verify your email before login.', 404)
        }

        if (existingUser.google_id && !existingUser.password) {
            throw new AppError('Please use Google to sign in', 400)
        }

        const passwordMatch = await bcrypt.compare(user_password, existingUser.password as string)

        if (!passwordMatch){
            throw new AppError('Invalid email or password!', 401)
        }

        const payload={
            id: existingUser.id,
            role: existingUser.role,
            email: existingUser.email,
            name: existingUser.name
        }
        
        // sign token
        const token = generateJwtToken(payload)

        const { password, email_verification_token, forgot_password_token, ...safeUser } = existingUser

        return {
            success: true,
            message: "User logged in successfully!",
            user:safeUser,
            token
        }
        
    } catch (error) {
        throw error
    }

}

export const forgotPassword = async (email:string) => {
    try {
        const user = await findUserByEmail(email)

        if (!user){
            throw new AppError('User not found!', 404)
        }

        // generate forgot password token
        const passwordToken = generateVerificationToken()

        const hashToken = crypto.createHash('sha256').update(passwordToken.token).digest('hex')

        await storeForgotPasswordToken(email, hashToken, passwordToken.expiry)

        await sendPasswordResetEmail(user.email, passwordToken.token)

        return {
            success: true, message: 'Password reset email sent'
        }
    } catch (error) {
        throw error
    }
}

export const resetUserPassword = async (token:string, password:string)=>{
    try {
        // hash password token 
        const hashed_token = crypto.createHash('sha256').update(token).digest('hex')
        const user = await findUserByForgotPasswordToken(hashed_token)

        if (!user || !user.forgot_password_token_expires_at){
            throw new AppError('Invalid token!', 401)
        } 

        // check if the token has expired
        const is_token_expired = user.forgot_password_token_expires_at < new Date()

        if (is_token_expired){
            throw new AppError('Token has expired!', 400)
        }

        // hash new password
        const salt = await bcrypt.genSalt(10)
        const hashed_password = await bcrypt.hash(password, salt)

        await resetPassword(user.id, hashed_password)

        return { 
            success: true,
            message: 'Password reset successfully'
        }

    } catch (error) {
        throw error
    }
}
