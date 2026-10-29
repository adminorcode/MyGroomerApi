import { createHash } from 'crypto'

const hash = (sql: string) => createHash('sha256').update(sql).digest('hex')

export const migrationChecksums = (sql: string) => {
    const normalized = sql.replace(/\r\n/g, '\n')
    return {
        checksum: hash(normalized),
        compatible: new Set([hash(sql), hash(normalized), hash(normalized.replace(/\n/g, '\r\n'))])
    }
}
