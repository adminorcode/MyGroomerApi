import rateLimit from "express-rate-limit";
import { isLocalTestMode } from './runtime.config';

// general rate limit - all routes
export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: () => isLocalTestMode() ? 10000 : 100,
    skip: (req) => req.path === '/api/v1/payments/webhook',
    message:{
        success: false,
        message: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
})

// strict rate limit - login and register
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: () => isLocalTestMode() ? 1000 : 10,
    message:{
        success: false,
        message: 'Too many attempts, please try again in 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
})

