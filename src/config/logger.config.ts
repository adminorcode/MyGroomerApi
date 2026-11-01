import winston from "winston";
import { appServiceName } from "./app.config";

const isDevelopment = process.env.NODE_ENV != 'production'


export const logger = winston.createLogger({
    level: isDevelopment ? 'debug' : 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), 
        winston.format.errors({stack: true}),
        winston.format.json()
    ),
    defaultMeta: {service: appServiceName},
    transports:[
        // error logs only
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
        }),
        //all logs
        new winston.transports.File({
            filename:'logs/combined.log'
        })
    ]
})

// console transport - pretty format for development
if (isDevelopment) {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
            winston.format.printf(({timestamp, level, message, ...meta})=>{
                return `${timestamp} [${level}]: ${message} ${
                    Object.keys(meta).length ? JSON.stringify(meta) : ''
                }`
            })
        )
    }))
}