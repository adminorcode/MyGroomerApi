import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { withDatabaseTransaction } from './database'
import { migrationChecksums } from './migration-checksum'

const migrate = async () => withDatabaseTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('mygroomer:migrations'))")
    const registry = await client.query("SELECT to_regclass('public.schema_migrations') AS name")
    if (!registry.rows[0].name) {
        const existing = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")
        if (existing.rowCount) throw new Error('Existing schema has no migration history; refusing to overwrite it')
    }
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
        name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const directory = path.resolve(__dirname, '../../migrations')
    for (const name of (await readdir(directory)).filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
        const sql = await readFile(path.join(directory, name), 'utf8')
        const { checksum, compatible } = migrationChecksums(sql)
        const applied = await client.query('SELECT checksum FROM public.schema_migrations WHERE name=$1', [name])
        if (applied.rowCount) {
            if (!compatible.has(applied.rows[0].checksum)) throw new Error(`Applied migration was changed: ${name}`)
            if (applied.rows[0].checksum !== checksum) {
                await client.query('UPDATE public.schema_migrations SET checksum=$1 WHERE name=$2', [checksum, name])
            }
            console.log(`Already applied: ${name}`)
            continue
        }
        await client.query(sql)
        await client.query('INSERT INTO public.schema_migrations(name, checksum) VALUES ($1,$2)', [name, checksum])
        console.log(`Applied: ${name}`)
    }
})

migrate().catch(error => { console.error(`Migration failed: ${error.message}`); process.exitCode = 1 })
