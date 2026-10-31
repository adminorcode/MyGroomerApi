import { PoolClient } from 'pg'
import { executor, withTransaction } from '../../shared/db/transaction'
import { AppError } from '../../shared/errors'
import { SaveRegistrationInput } from './registration.schemas'
import { CACHE_KEYS } from '../../constants'
import { deleteCache } from '../../shared/cache/cache'

export const readRegistration = async (providerId: string, client?: PoolClient) => {
    const db = executor(client)
    const current = await db.query(`
        SELECT COALESCE(r.name, u.name) AS name, COALESCE(r.email, u.email) AS email,
               COALESCE(r.phone_number, u.phone_number, '') AS phone_number,
               COALESCE(r.document, '') AS document, COALESCE(r.experience, '') AS experience,
               COALESCE(r.certifications, '') AS certifications,
               COALESCE(r.status, 'not_started') AS status,
               COALESCE(r.professional_type_ids,
                   ARRAY(SELECT professional_type_id FROM provider_professional_types WHERE provider_id = p.id)
               ) AS professional_type_ids
        FROM providers p INNER JOIN users u ON u.id = p.user_id
        LEFT JOIN provider_registrations r ON r.provider_id = p.id
        WHERE p.id = $1`, [providerId])
    if (!current.rows[0]) throw new AppError('Perfil profissional não encontrado.', 404)
    const attachments = await db.query(`
        SELECT id, name, mime_type, size FROM provider_registration_attachments
        WHERE provider_id = $1 ORDER BY created_at, id`, [providerId])
    return { ...current.rows[0], attachments: attachments.rows }
}

/** The caller owns the transaction; row locks serialize menu publication and changes to its types. */
export const writeRegistration = async (client: PoolClient, providerId: string, input: SaveRegistrationInput) => {
    const owner = await client.query(`
        SELECT p.id, p.user_id, u.email FROM providers p INNER JOIN users u ON u.id = p.user_id
        WHERE p.id = $1 FOR UPDATE OF p, u`, [providerId])
    const provider = owner.rows[0]
    if (!provider) throw new AppError('Perfil profissional não encontrado.', 404)
    if (input.email.toLowerCase() !== String(provider.email).toLowerCase()) {
        throw new AppError('O e-mail do acesso não pode ser alterado neste cadastro.', 400)
    }

    const ids = input.professional_type_ids
    if (ids.length) {
        const types = await client.query(`
            SELECT id FROM professional_types WHERE id = ANY($1::uuid[]) AND is_active FOR SHARE`, [ids])
        if (types.rowCount !== ids.length) throw new AppError('Escolha somente tipos ativos do catálogo.', 400)
    }

    // Existing evidence IDs are references, never arbitrary file URLs or other accounts' files.
    const retainedIds = input.attachments.flatMap(file => 'id' in file ? [file.id] : [])
    if (retainedIds.length !== new Set(retainedIds).size) throw new AppError('Não repita os anexos.', 400)
    const existing = await client.query(`
        SELECT id, name, mime_type, size FROM provider_registration_attachments
        WHERE provider_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE`, [providerId, retainedIds])
    for (const file of input.attachments) {
        if (!('id' in file)) continue
        const stored = existing.rows.find(row => row.id === file.id)
        if (!stored || stored.name !== file.name || stored.mime_type !== file.mime_type || stored.size !== file.size) {
            throw new AppError('Anexo não encontrado neste cadastro. Selecione o arquivo novamente.', 400)
        }
    }

    if (input.mode === 'continue') {
        const used = await client.query(`
            SELECT 1 FROM provider_services
            WHERE provider_id = $1 AND is_active AND professional_type_id IS NOT NULL
              AND NOT (professional_type_id = ANY($2::uuid[])) LIMIT 1`, [providerId, ids])
        if (used.rowCount) throw new AppError('Este tipo está em uso por um serviço ativo. Edite os serviços antes de removê-lo.', 409)
        await client.query(`DELETE FROM provider_professional_types
            WHERE provider_id = $1 AND NOT (professional_type_id = ANY($2::uuid[]))`, [providerId, ids])
        await client.query(`INSERT INTO provider_professional_types(provider_id, professional_type_id)
            SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [providerId, ids])
        await client.query('UPDATE users SET name = $2, phone_number = $3, updated_at = now() WHERE id = $1',
            [provider.user_id, input.name, input.phone_number])
        await client.query('UPDATE providers SET updated_at = now() WHERE id = $1', [providerId])
    }

    await client.query(`
        INSERT INTO provider_registrations (provider_id, name, email, phone_number, document,
            experience, certifications, professional_type_ids, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(provider_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email,
            phone_number = EXCLUDED.phone_number, document = EXCLUDED.document,
            experience = EXCLUDED.experience, certifications = EXCLUDED.certifications,
            professional_type_ids = EXCLUDED.professional_type_ids, status = EXCLUDED.status, updated_at = now()`,
        [providerId, input.name, provider.email, input.phone_number, input.document,
            input.experience, input.certifications, ids, input.mode === 'continue' ? 'completed' : 'draft'])
    await client.query(`DELETE FROM provider_registration_attachments
        WHERE provider_id = $1 AND NOT (id = ANY($2::uuid[]))`, [providerId, retainedIds])
    for (const file of input.attachments) {
        if ('id' in file) continue
        await client.query(`INSERT INTO provider_registration_attachments(provider_id, name, mime_type, size, content)
            VALUES ($1,$2,$3,$4,$5)`, [providerId, file.name, file.mime_type, file.size, Buffer.from(file.base64, 'base64')])
    }
    return readRegistration(providerId, client)
}

export const saveRegistration = async (providerId: string, input: SaveRegistrationInput) => {
    const result = await withTransaction(client => writeRegistration(client, providerId, input))
    if (input.mode === 'continue') {
        const services = await executor().query('SELECT service_id FROM provider_services WHERE provider_id = $1 AND service_id IS NOT NULL', [providerId])
        await Promise.all(services.rows.map(row => deleteCache(CACHE_KEYS.SERVICE_PROVIDERS(row.service_id))))
    }
    return result
}
