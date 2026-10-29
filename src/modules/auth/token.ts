import crypto from 'crypto'


export const generateVerificationToken = ():{token:string, expiry:Date}=>{
    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
    return {
        token,
        expiry
    }
}

