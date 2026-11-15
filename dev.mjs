import { createServer } from 'node:http'
import { Readable } from 'node:stream'
await import('./build.mjs')
const { default: worker } = await import('./dist/server/index.js')
const hostname = '127.0.0.1'
const port = Number(process.env.COSMOCODING_PORT || 4316)

createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://${hostname}:${port}`
    if (incoming.headers.host !== `${hostname}:${port}`) {
      outgoing.writeHead(403).end()
      return
    }
    const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : Readable.toWeb(incoming)
    const request = new Request(origin + incoming.url, { method: incoming.method, headers: incoming.headers, body, duplex: body ? 'half' : undefined })
    const response = await worker.fetch(request)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing)
    else outgoing.end()
  } catch {
    outgoing.writeHead(500).end()
  }
}).listen(port, hostname, () => console.log(`CosmoCoding: http://${hostname}:${port}`))
