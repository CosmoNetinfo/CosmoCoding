import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const result = spawnSync(resolve(process.argv[2]), ['--cosmocoding-smoke'], {
  timeout: 35_000, stdio: 'inherit', windowsHide: true
})
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 1
