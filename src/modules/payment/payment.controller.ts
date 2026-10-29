import { Request, Response } from 'express'
import { AppError } from '../../shared/errors'
import { handlePaymentWebhook } from './payment.webhook.service'
import { initializePaymentForBooking } from './initialize-payment.service'

export const initializePayment = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Não autorizado', 401)
    const result = await initializePaymentForBooking(req.user, req.body?.booking_id)
    if (result.kind === 'existing') {
        res.status(200).json({
            success: true,
            message: 'Payment already initiated',
            data: result.payment,
        })
        return
    }

    res.status(201).json({
        success: true,
        message: 'Payment initiated',
        data: result.authorizationUrl,
    })
}

export const webhookHandler = async (req: Request, res: Response) => {
    const header = req.headers['x-paystack-signature']
    const signature = typeof header === 'string' ? header : undefined
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''))
    await handlePaymentWebhook(rawBody, signature)
    res.status(200).json({ received: true })
}
