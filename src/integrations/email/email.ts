import { Resend } from 'resend'
import { isLocalTestMode } from '../../config/runtime.config'
import { AppError } from '../../shared/errors'

export const sendEmail = async (email: string, content: { subject: string, html: string }) => {
    if (isLocalTestMode()) return { id: 'local-test-email-not-sent' }
    const resend = new Resend(process.env.RESEND_API_KEY)

    const to = process.env.NODE_ENV === 'production'
        ? [email]
        : [process.env.RESEND_TEST_EMAIL!]

    const mailbox = process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
    const { data, error } = await resend.emails.send({
        from: `Tio de Pet <${mailbox}>`,
        to,
        subject: content.subject,
        html: content.html,
    })

    if (error) {
        console.log('Error', error)
        throw new AppError('Failed to send email', 500)
    }

    return data
}

export const sendPasswordResetEmail = async (email: string, token: string) => {
    await sendEmail(email, {
        subject: 'Redefinir senha do Tio de Pet',
        html: `
            <p>Você pediu uma nova senha da sua conta Tio de Pet.</p>
            <a href="${process.env.CLIENT_URL}/reset-password?token=${token}">Redefinir senha</a>
            <p>Este link expira em 24 horas.</p>
            <p>Se você não pediu isso, ignore este e-mail.</p>
        `,
    })
}

export const sendEmailVerificationToken = async (token: string, email: string) => {
    await sendEmail(email, {
        subject: 'Confirme seu e-mail no Tio de Pet',
        html: `
            <p>Confirme que este e-mail é seu para usar o Tio de Pet.</p>
            <a href="${process.env.CLIENT_URL}/verify-email?token=${token}">Confirmar e-mail</a>
            <p>Se o link acima não abrir, copie e abra este endereço:</p>
            <p>${process.env.CLIENT_URL}/verify-email?token=${token}</p>
            <p>Este link expira em 24 horas.</p>
            <p>Se você não pediu isso, ignore este e-mail.</p>
        `,
    })
}
