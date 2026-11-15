import { createServer } from 'node:http'
import { Readable } from 'node:stream'

export async function startWorkspace(worker) {
  const host = '127.0.0.1'
  let authority
  const server = createServer(async (incoming, outgoing) => {
    try {
      if (incoming.headers.host !== authority || !incoming.url?.startsWith('/')) {
        outgoing.writeHead(403).end()
        return
      }
      const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : Readable.toWeb(incoming)
      const request = new Request(`http://${authority}${incoming.url}`, {
        method: incoming.method, headers: incoming.headers, body, duplex: body ? 'half' : undefined
      })
      const response = await worker.fetch(request)
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      if (response.body) {
        const stream = Readable.fromWeb(response.body)
        stream.on('error', () => outgoing.destroy())
        outgoing.on('close', () => stream.destroy())
        stream.pipe(outgoing)
      } else {
        outgoing.end()
      }
    } catch {
      if (outgoing.headersSent) outgoing.destroy()
      else outgoing.writeHead(500).end()
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => {
      authority = `${host}:${server.address().port}`
      server.removeListener('error', reject)
      resolve()
    })
  })
  return { origin: `http://${authority}`, close: () => server.close() }
}
