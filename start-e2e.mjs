import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)
require('dotenv').config({ quiet: true })

const current = process.env.DATABASE_URL
if (!current) {
  console.error('DATABASE_URL ausente')
  process.exit(1)
}
if (process.env.LOCAL_TEST_MODE !== 'true') {
  console.error('LOCAL_TEST_MODE ausente')
  process.exit(1)
}

const url = new URL(current)
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  console.error('A API de ponta a ponta recusou um host que não é local')
  process.exit(1)
}
const name = url.pathname.replace(/^\//, '')
if (name !== 'mygroomer_dev' && name !== 'mygroomer_e2e') {
  console.error('A API de ponta a ponta só aceita o Postgres local de desenvolvimento')
  process.exit(1)
}
url.pathname = '/mygroomer_e2e'
process.env.DATABASE_URL = url.toString()

const child = spawn(process.execPath, ['dist/server.js'], { stdio: 'inherit', env: process.env })
child.on('exit', code => process.exit(code ?? 1))
