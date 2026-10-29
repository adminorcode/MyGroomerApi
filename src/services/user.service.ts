import { CreateUserInput, Role, User } from "../types/user.types";
import { getPool } from "../config/database.config";


export const findUserByEmail = async (email:string): Promise<User|null> => {
    const pool = getPool()
    try {
        const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email])
        return result.rows[0] || null
    } catch (error) {
        throw error
    }
}

export const findUserById = async (user_id:string): Promise<User|null> => {
    const pool = getPool()
    try {
        const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [user_id])
        return result.rows[0] || null
    } catch (error) {
        throw error
    }
}

export const createUser = async (input: CreateUserInput): Promise<User>=>{
    const pool = getPool()
    try {
        const result = await pool.query(`
            INSERT INTO users (name, email, password, role, email_verification_token, email_verification_token_expires_at, address, profile_picture, phone_number, google_id, email_verified_at, terms_accepted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
            `, 
            [
                input.name,
                input.email,
                input.password,
                input.role,
                input.email_verification_token,
                input.email_verification_token_expires_at,
                input.address,
                input.profile_picture,
                input.phone_number,
                input.google_id,
                input.email_verified_at,
                input.terms_accepted_at
            ]
        )
        return result.rows[0]
    } catch (error) {
        throw error
    }
}

export const findUserByVerificationToken = async (token:string): Promise< User | null > => {
    const pool = getPool()
    try {
        const result = await pool.query(`SELECT * FROM users WHERE email_verification_token = $1`, [token])
        return result.rows[0] || null

    } catch (error) {
        throw error
    }
}

export const verifyUserEmail = async (id:string) => {
    const pool = getPool()
    try {
        // get user by email and update email_verified_at, email_verification_token and email_verification_token_expires_at
        const result = await pool.query(`
            UPDATE users 
            SET email_verified_at = $1, email_verification_token = $2, email_verification_token_expires_at= $3
            WHERE id = $4
            RETURNING *`,
            [
                new Date(),
                null,
                null,
                id
            ]
        )

        return result.rows[0]
    } catch (error) {
        throw error
    }
}

export const storeForgotPasswordToken = async (email:string, token:string, token_expiry:Date):
    Promise<{
        forgot_password_token:string, 
        forgot_password_token_expires_at:string
    }> => {
    try {
        const pool = getPool()
        const result = await pool.query(`
            UPDATE users
            SET forgot_password_token=$1, forgot_password_token_expires_at=$2
            WHERE email =$3
            RETURNING forgot_password_token, forgot_password_token_expires_at`,
            [
                token,
                token_expiry,
                email
            ]
        )

        return result.rows[0]

    } catch (error) {
        throw error
    }
}

export const findUserByForgotPasswordToken = async (token:string):Promise<User|null> => {
    try {
        const pool = getPool()
        const result = await pool.query(
            `SELECT * FROM users WHERE forgot_password_token=$1`,
            [token]
        )
        return result.rows[0] || null
    } catch (error) {
        throw error
    }
}


export const resetPassword = async (id:string, password:string) => {
    try {
        const pool = getPool()
        const result = await pool.query(`
            UPDATE users
            SET forgot_password_token=$1, forgot_password_token_expires_at=$2, password=$3
            WHERE id=$4`,
            [
                null,
                null,
                password,
                id
            ]
        )
        return result.rows[0]
    } catch (error) {
        throw error
    }
}


export const updateUser = async (
    id: string,
    update: Partial<{
        email: string
        name: string
        password: string
        phone_number: string
        profile_picture: string
        address: string
        role: Role
        is_online: boolean
    }>
): Promise<User | null> => {
    try {
        const pool = getPool()

        const fields: string[] = []
        const values: any[] = []
        let idx = 1

        if (update.email !== undefined) {
            fields.push(`email = $${idx++}`)
            values.push(update.email)
        }
        if (update.name !== undefined) {
            fields.push(`name = $${idx++}`)
            values.push(update.name)
        }
        if (update.phone_number !== undefined) {
            fields.push(`phone_number = $${idx++}`)
            values.push(update.phone_number)
        }
        if (update.address !== undefined) {
            fields.push(`address = $${idx++}`)
            values.push(update.address)
        }
        if (update.profile_picture !== undefined) {
            fields.push(`profile_picture = $${idx++}`)
            values.push(update.profile_picture)
        }
        if (update.password !== undefined) {
            fields.push(`password = $${idx++}`)
            values.push(update.password)
        }
        if (update.is_online !== undefined) {
            fields.push(`is_online = $${idx++}`)
            values.push(update.is_online)
        }
        if (update.role !== undefined) {
            fields.push(`role = $${idx++}`)
            values.push(update.role)
        }
    
        if (fields.length === 0) {
            return null
        }

        const query = `
            UPDATE users
            SET ${fields.join(', ')}
            WHERE id = $${idx}
            RETURNING *
        `
        values.push(id)

        const result = await pool.query(query, values)
        return result.rows[0] || null
    } catch (error) {
        throw error
    }
}