import { copyFile, mkdir } from 'node:fs/promises'

await import('../build.mjs')
await mkdir(new URL('./generated/', import.meta.url), { recursive: true })
await copyFile(new URL('../dist/server/index.js', import.meta.url), new URL('./generated/workspace.mjs', import.meta.url))
await copyFile(new URL('../cosmocoding-icon-512.png', import.meta.url), new URL('./generated/icon.png', import.meta.url))
