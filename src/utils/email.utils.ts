import { Resend } from "resend"
import { AppError } from "../middlewares/errorHandler"
import { isLocalTestMode } from '../config/runtime.config'

export const sendEmail = async (email:string, content:{subject:string, html:string}) => {
    if (isLocalTestMode()) return { id: 'local-test-email-not-sent' }
    const resend = new Resend(process.env.RESEND_API_KEY)

    const to = process.env.NODE_ENV === 'production'
        ? [email]
        : [process.env.RESEND_TEST_EMAIL!]

    const {data, error} = await resend.emails.send({
        from: "onboarding@resend.dev",
        to,
        subject: content.subject,
        html: content.html
    })

    if (error) {
        console.log("Error", error)
        throw new AppError('Failed to send email', 500)
    }

        return data
}

export const sendPasswordResetEmail = async (email:string, token:string)=> {
    await sendEmail(email, {
        subject: 'Password Reset',
        html: `
            <p>You requested a password reset for your Boame account.</p>
            <a href="${process.env.CLIENT_URL}/reset-password?token=${token}">Reset your password</a>
            <p>This link expires in 24 hours.</p>
            <p>If you didn't request this, ignore this email.</p>
        `
    })
}

export const sendEmailVerificationToken = async (token:string, email:string)=>{
    await sendEmail(email, {
        subject: 'Email Verification',
        html: `
            <p>This is to verify that this email belongs to you.</p>
            <a href="${process.env.CLIENT_URL}/verify-email?token=${token}">Verify your email</a>
            <p>If the link above doesn't work, copy and open this link:</p>
            <p>${process.env.CLIENT_URL}/verify-email?token=${token}</p>
            <p>This link expires in 24 hours.</p>
            <p>If you didn't request this, ignore this email.</p>
        `
    })
}
