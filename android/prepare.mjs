import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { starter } from '../template.mjs'

const build = new URL('./app/build/generated/workspace/', import.meta.url)
const assets = new URL('assets/', build)
const drawable = new URL('res/drawable-nodpi/', build)
await Promise.all([mkdir(assets, { recursive: true }), mkdir(drawable, { recursive: true })])
const files = ['index.html', 'style.css', 'app.js', 'api.mjs', 'template.mjs', 'upstream.mjs',
  'native-transport.mjs', 'manifest.webmanifest', 'cosmocoding-icon-192.png', 'cosmocoding-icon-512.png']
await Promise.all([
  ...files.map(file => copyFile(new URL('../' + file, import.meta.url), new URL(file, assets))),
  writeFile(new URL('starter.json', assets), JSON.stringify(starter)),
  copyFile(new URL('../cosmocoding-icon-192.png', import.meta.url), new URL('launcher.png', drawable))
])
