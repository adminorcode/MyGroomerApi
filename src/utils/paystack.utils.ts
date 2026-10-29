import axios from "axios"
import { logger } from "../config/logger.config"
import { AppError } from "../middlewares/errorHandler"
import { InitiateTransfer, PaystackInitialize, TransferRecipient } from "../types/paystack.types"
import { assertPaymentsEnabled } from '../config/runtime.config'



export const initializePaystackPayment = async (email:string, amount:number, reference:string, callback_url?:string):Promise<PaystackInitialize> => {
    assertPaymentsEnabled()
    try {
        const initialize  = await axios.post(`https://api.paystack.co/transaction/initialize`, 
            {   
                email,
                amount,
                reference,
                callback_url
            },{
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                }
            })

        if(!initialize.data){
            throw new AppError('Payment initialization failed!', 500)
        }

        return initialize.data
    } catch (error) {
        throw error
    }
}

export const verifyPaystackPayment = async (reference:string):Promise<{data:{status:string}}> => {
    assertPaymentsEnabled()
    try {
        const verify = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`,{
            headers:{
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            }
        })
        return verify.data
    } catch (error) {
        throw error
    }
}

export const refundPaystackPayment = async (reference: string, amount: number) => {
    assertPaymentsEnabled()
    try {
        const refund = await axios.post(
            'https://api.paystack.co/refund',
            {
                transaction: reference,
                amount  // amount in pesewas
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                }
            }
        )
        return refund.data
    } catch (error) {
        logger.error('refundPaystackPayment error', { error })
        throw error
    }
}


export const createPaystackTransferRecipient = async (recipient:TransferRecipient):Promise<string> => {
    assertPaymentsEnabled()
    try {
        const transfer = await axios.post('https://api.paystack.co/transferrecipient', 
            {
                type: recipient.type,
                name: recipient.name,
                account_number: recipient.account_number,
                bank_code: recipient.bank_code,
                currency: recipient.currency
            },
            {
                headers:{
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                }
            })
        return transfer.data.data.recipient_code
    } catch (error) {
        logger.error('createPaystackTransferRecipient error', { error })
        throw error
    }
}

export const initiatePaystackTransfer = async (transfer:InitiateTransfer) => {
    assertPaymentsEnabled()
    try{
        const result = await axios.post('https://api.paystack.co/transfer', 
            {
                source: transfer.source,
                amount: transfer.amount,
                recipient: transfer.recipient,
                reason: transfer.reason
            }, 
            {
                headers:{
                    Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                }
            })

        return result.data
    } catch(error){
        logger.error('initiatePaystackTransfer error', { error })
        throw error
    }
}
