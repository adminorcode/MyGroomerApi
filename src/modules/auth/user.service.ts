import { SQL } from 'drizzle-orm'
import { PoolClient } from 'pg'
import { col, execute, sql } from '../../shared/db/drizzle'
import { CreateUserInput, Role, User } from './user.types'
import { users } from './user.table'

export const findUserByEmail = async (email: string): Promise<User | null> => {
    const result = await execute<User>(undefined, sql`SELECT * FROM ${users} WHERE ${users.email} = ${email}`)
    return result.rows[0] || null
}

export const findUserById = async (user_id: string): Promise<User | null> => {
    const result = await execute<User>(undefined, sql`SELECT * FROM ${users} WHERE ${users.id} = ${user_id}`)
    return result.rows[0] || null
}

export const createUser = async (input: CreateUserInput, client?: PoolClient): Promise<User> => {
    const result = await execute<User>(client, sql`
        INSERT INTO ${users} (
            name, email, password, role, email_verification_token, email_verification_token_expires_at,
            address, profile_picture, phone_number, google_id, email_verified_at, terms_accepted_at
        )
        VALUES (
            ${input.name}, ${input.email}, ${input.password ?? null}, ${input.role},
            ${input.email_verification_token ?? null}, ${input.email_verification_token_expires_at ?? null},
            ${input.address ?? null}, ${input.profile_picture ?? null}, ${input.phone_number ?? null},
            ${input.google_id ?? null}, ${input.email_verified_at ?? null}, ${input.terms_accepted_at ?? null}
        )
        RETURNING *
    `)
    return result.rows[0]
}

export const findUserByVerificationToken = async (token: string): Promise<User | null> => {
    const result = await execute<User>(undefined, sql`
        SELECT * FROM ${users} WHERE ${users.email_verification_token} = ${token}
    `)
    return result.rows[0] || null
}

export const verifyUserEmail = async (id: string) => {
    const result = await execute<User>(undefined, sql`
        UPDATE ${users}
        SET ${col(users.email_verified_at)} = ${new Date()},
            ${col(users.email_verification_token)} = ${null},
            ${col(users.email_verification_token_expires_at)} = ${null}
        WHERE ${users.id} = ${id}
        RETURNING *
    `)
    return result.rows[0]
}

export const storeForgotPasswordToken = async (email: string, token: string, token_expiry: Date): Promise<{
    forgot_password_token: string
    forgot_password_token_expires_at: string
}> => {
    const result = await execute<{
        forgot_password_token: string
        forgot_password_token_expires_at: string
    }>(undefined, sql`
        UPDATE ${users}
        SET ${col(users.forgot_password_token)} = ${token},
            ${col(users.forgot_password_token_expires_at)} = ${token_expiry}
        WHERE ${users.email} = ${email}
        RETURNING forgot_password_token, forgot_password_token_expires_at
    `)
    return result.rows[0]
}

export const findUserByForgotPasswordToken = async (token: string): Promise<User | null> => {
    const result = await execute<User>(undefined, sql`
        SELECT * FROM ${users} WHERE ${users.forgot_password_token} = ${token}
    `)
    return result.rows[0] || null
}

export const resetPassword = async (id: string, password: string) => {
    const result = await execute<User>(undefined, sql`
        UPDATE ${users}
        SET ${col(users.forgot_password_token)} = ${null},
            ${col(users.forgot_password_token_expires_at)} = ${null},
            ${col(users.password)} = ${password}
        WHERE ${users.id} = ${id}
    `)
    return result.rows[0]
}

export const updateUserNameAndPhone = async (client: PoolClient, userId: string, name: string, phoneNumber: string) => {
    await execute(client, sql`
        UPDATE ${users}
        SET ${col(users.name)} = ${name},
            ${col(users.phone_number)} = ${phoneNumber},
            ${col(users.updated_at)} = now()
        WHERE ${users.id} = ${userId}
    `)
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
    }>,
    client?: PoolClient,
): Promise<User | null> => {
    const assignments: SQL[] = []
    if (update.email !== undefined) assignments.push(sql`${col(users.email)} = ${update.email}`)
    if (update.name !== undefined) assignments.push(sql`${col(users.name)} = ${update.name}`)
    if (update.phone_number !== undefined) assignments.push(sql`${col(users.phone_number)} = ${update.phone_number}`)
    if (update.address !== undefined) assignments.push(sql`${col(users.address)} = ${update.address}`)
    if (update.profile_picture !== undefined) assignments.push(sql`${col(users.profile_picture)} = ${update.profile_picture}`)
    if (update.password !== undefined) assignments.push(sql`${col(users.password)} = ${update.password}`)
    if (update.is_online !== undefined) assignments.push(sql`${col(users.is_online)} = ${update.is_online}`)
    if (update.role !== undefined) assignments.push(sql`${col(users.role)} = ${update.role}`)
    if (assignments.length === 0) return null
    const result = await execute<User>(client, sql`
        UPDATE ${users}
        SET ${sql.join(assignments, sql`, `)}
        WHERE ${users.id} = ${id}
        RETURNING *
    `)
    return result.rows[0] || null
}
