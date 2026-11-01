import { PoolClient } from 'pg'
import { z } from 'zod'
import { withTransaction } from '../../shared/db/transaction'
import { bound, col, execute, sql } from '../../shared/db/drizzle'
import { AppError } from '../../shared/errors'
import { registrationDetailsSchema, requireCompleteRegistration, SaveRegistrationInput } from './registration.schemas'
import { CACHE_KEYS } from '../../constants'
import { deleteCache } from '../../shared/cache/cache'
import { updateUserNameAndPhone } from '../auth/user.service'
import {
    replaceProviderProfessionalTypes,
    shareActiveProfessionalTypes,
} from '../professional-type/professional-type.service'
import {
    providerRegistrationAttachments,
    providerRegistrations,
    providerServices,
    providers,
} from './provider.table'

export const readRegistration = async (providerId: string, client?: PoolClient) => {
    const current = await execute(client, sql`
        SELECT COALESCE(r.name, u.name) AS name, COALESCE(r.email, u.email) AS email,
               COALESCE(r.phone_number, u.phone_number, '') AS phone_number,
               COALESCE(r.document, '') AS document, COALESCE(r.experience, '') AS experience,
               COALESCE(r.certifications, '') AS certifications,
               COALESCE(r.status, 'not_started') AS status,
               COALESCE(r.professional_type_ids,
                   ARRAY(SELECT professional_type_id FROM provider_professional_types WHERE provider_id = p.id)
               ) AS professional_type_ids
        FROM ${providers} p INNER JOIN users u ON u.id = p.user_id
        LEFT JOIN ${providerRegistrations} r ON r.provider_id = p.id
        WHERE p.id = ${providerId}
    `)
    if (!current.rows[0]) throw new AppError('Perfil profissional não encontrado.', 404)
    const attachments = await execute(client, sql`
        SELECT ${providerRegistrationAttachments.id} AS id,
               ${providerRegistrationAttachments.name} AS name,
               ${providerRegistrationAttachments.mime_type} AS mime_type,
               ${providerRegistrationAttachments.size} AS size
        FROM ${providerRegistrationAttachments}
        WHERE ${providerRegistrationAttachments.provider_id} = ${providerId}
        ORDER BY ${providerRegistrationAttachments.created_at}, ${providerRegistrationAttachments.id}
    `)
    return { ...current.rows[0], attachments: attachments.rows }
}

export const applySignupRegistration = (
    data: { name: string, email: string, phone_number?: string, registration?: unknown },
    ctx: z.RefinementCtx,
) => {
    if (!data.registration) {
        ctx.addIssue({ code: 'custom', path: ['registration'], message: 'Preencha os dados do cadastro profissional.' })
        return
    }
    const parsed = registrationDetailsSchema.safeParse(data.registration)
    if (!parsed.success) {
        for (const issue of parsed.error.issues) {
            ctx.addIssue({ code: 'custom', path: ['registration', ...issue.path], message: issue.message })
        }
        return
    }
    requireCompleteRegistration({
        ...parsed.data,
        name: data.name,
        email: data.email,
        phone_number: data.phone_number,
    }, ctx)
}

/** The caller owns the transaction; row locks serialize menu publication and changes to its types. */
export const writeRegistration = async (client: PoolClient, providerId: string, input: SaveRegistrationInput) => {
    const owner = await execute<{ id: string, user_id: string, email: string }>(client, sql`
        SELECT p.id, p.user_id, u.email FROM ${providers} p INNER JOIN users u ON u.id = p.user_id
        WHERE p.id = ${providerId} FOR UPDATE OF p, u
    `)
    const provider = owner.rows[0]
    if (!provider) throw new AppError('Perfil profissional não encontrado.', 404)
    if (input.email.toLowerCase() !== String(provider.email).toLowerCase()) {
        throw new AppError('O e-mail do acesso não pode ser alterado neste cadastro.', 400)
    }

    const ids = input.professional_type_ids
    if (ids.length) {
        const shared = await shareActiveProfessionalTypes(client, ids)
        if (shared !== ids.length) throw new AppError('Escolha somente tipos ativos do catálogo.', 400)
    }

    const retainedIds = input.attachments.flatMap(file => 'id' in file ? [file.id] : [])
    if (retainedIds.length !== new Set(retainedIds).size) throw new AppError('Não repita os anexos.', 400)
    const existing = await execute<{ id: string, name: string, mime_type: string, size: number }>(client, sql`
        SELECT id, name, mime_type, size FROM ${providerRegistrationAttachments}
        WHERE ${providerRegistrationAttachments.provider_id} = ${providerId}
          AND id = ANY(${bound(retainedIds)}::uuid[])
        FOR UPDATE
    `)
    for (const file of input.attachments) {
        if (!('id' in file)) continue
        const stored = existing.rows.find(row => row.id === file.id)
        if (!stored || stored.name !== file.name || stored.mime_type !== file.mime_type || stored.size !== file.size) {
            throw new AppError('Anexo não encontrado neste cadastro. Selecione o arquivo novamente.', 400)
        }
    }

    if (input.mode === 'continue') {
        const used = await execute(client, sql`
            SELECT 1 FROM ${providerServices}
            WHERE ${providerServices.provider_id} = ${providerId}
              AND ${providerServices.is_active}
              AND ${providerServices.professional_type_id} IS NOT NULL
              AND NOT (${providerServices.professional_type_id} = ANY(${bound(ids)}::uuid[]))
            LIMIT 1
        `)
        if (used.rowCount) throw new AppError('Este tipo está em uso por um serviço ativo. Edite os serviços antes de removê-lo.', 409)
        await replaceProviderProfessionalTypes(client, providerId, ids)
        await updateUserNameAndPhone(client, provider.user_id, input.name, input.phone_number)
        await execute(client, sql`UPDATE ${providers} SET ${col(providers.updated_at)} = now() WHERE ${providers.id} = ${providerId}`)
    }

    await execute(client, sql`
        INSERT INTO ${providerRegistrations} (
            provider_id, name, email, phone_number, document, experience, certifications, professional_type_ids, status
        )
        VALUES (
            ${providerId}, ${input.name}, ${provider.email}, ${input.phone_number}, ${input.document},
            ${input.experience}, ${input.certifications}, ${bound(ids)}::uuid[], ${input.mode === 'continue' ? 'completed' : 'draft'}
        )
        ON CONFLICT(provider_id) DO UPDATE SET
            name = EXCLUDED.name, email = EXCLUDED.email,
            phone_number = EXCLUDED.phone_number, document = EXCLUDED.document,
            experience = EXCLUDED.experience, certifications = EXCLUDED.certifications,
            professional_type_ids = EXCLUDED.professional_type_ids, status = EXCLUDED.status, updated_at = now()
    `)
    await execute(client, sql`
        DELETE FROM ${providerRegistrationAttachments}
        WHERE ${providerRegistrationAttachments.provider_id} = ${providerId}
          AND NOT (id = ANY(${bound(retainedIds)}::uuid[]))
    `)
    for (const file of input.attachments) {
        if ('id' in file) continue
        await execute(client, sql`
            INSERT INTO ${providerRegistrationAttachments}(provider_id, name, mime_type, size, content)
            VALUES (${providerId}, ${file.name}, ${file.mime_type}, ${file.size}, ${Buffer.from(file.base64, 'base64')})
        `)
    }
    return readRegistration(providerId, client)
}

export const saveRegistration = async (providerId: string, input: SaveRegistrationInput) => {
    const result = await withTransaction(client => writeRegistration(client, providerId, input))
    if (input.mode === 'continue') {
        const services = await execute<{ service_id: string }>(undefined, sql`
            SELECT ${providerServices.service_id} AS service_id
            FROM ${providerServices}
            WHERE ${providerServices.provider_id} = ${providerId}
              AND ${providerServices.service_id} IS NOT NULL
        `)
        await Promise.all(services.rows.map(row => deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(row.service_id))))
    }
    return result
}
