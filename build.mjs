import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { starter } from './template.mjs'

const root = new URL('./', import.meta.url)
const text = file => readFile(new URL(file, root), 'utf8')
const assets = {
  '/': ['text/html; charset=utf-8', await text('index.html')],
  '/style.css': ['text/css; charset=utf-8', await text('style.css')],
  '/app.js': ['text/javascript; charset=utf-8', await text('app.js')],
  '/sw.js': ['text/javascript; charset=utf-8', await text('sw.js')],
  '/manifest.webmanifest': ['application/manifest+json', await text('manifest.webmanifest')],
  '/starter.json': ['application/json; charset=utf-8', JSON.stringify(starter)]
}
for (const size of [192, 512]) {
  const path = `/icon-${size}.png`
  const image = await readFile(new URL(path.slice(1), root))
  assets[path] = ['image/png', image.toString('base64')]
}

const api = (await text('api.mjs')).replace(/^import [^\n]+\r?\n/, '').replace('export async function handleApi', 'async function handleApi')
const template = (await text('template.mjs')).replaceAll('export const ', 'const ')
const worker = (await text('worker.mjs')).replace('/* ASSET_MAP */ null', JSON.stringify(assets))
const target = new URL('dist/server/', root)
await mkdir(target, { recursive: true })
await writeFile(new URL('index.js', target), [template, api, worker].join('\n'))
console.log('Worker pronto in dist/server/index.js')
