import { NextFunction, Request, Response } from 'express'
import { ZodError, ZodType } from 'zod'

const formatValidationErrors = (error: ZodError<unknown>) =>
    error.issues.map(err => ({
        field: err.path.join('.'),
        message: err.message,
    }))

const validateSource = (source: 'body' | 'query' | 'params') => (schema: ZodType) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req[source])

        if (!result.success) {
            res.status(400).json({
                success: false,
                message: 'Dados inválidos',
                errors: formatValidationErrors(result.error),
            })
            return
        }

        if (source === 'query') {
            Object.defineProperty(req, 'query', {
                value: result.data,
                writable: true,
                configurable: true,
                enumerable: true,
            })
        } else {
            req[source] = result.data
        }
        next()
    }
}

export const validate = validateSource('body')
export const validateQuery = validateSource('query')
export const validateParams = validateSource('params')
