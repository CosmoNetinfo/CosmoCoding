const nativeRequests = new Map()
let nativeSequence = 0

export function fetchProvider(url, options) {
  const bridge = globalThis.CosmoNative
  if (typeof bridge?.send !== 'function') return fetch(url, options)
  if (typeof globalThis.cosmoNativeReply !== 'function') {
    globalThis.cosmoNativeReply = (id, status, body) => {
      const finish = nativeRequests.get(id)
      if (finish) finish(status, body)
    }
  }
  return new Promise((resolve, reject) => {
    const id = String(++nativeSequence)
    const signal = options.signal
    const abort = () => {
      nativeRequests.delete(id)
      reject(signal.reason)
    }
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    nativeRequests.set(id, (status, body) => {
      nativeRequests.delete(id)
      signal?.removeEventListener('abort', abort)
      if (status < 200 || status > 599) reject(new Error('Richiesta non riuscita'))
      else resolve(new Response([204, 205, 304].includes(status) ? null : body, { status }))
    })
    signal?.addEventListener('abort', abort, { once: true })
    try {
      bridge.send(id, String(url), options.method, JSON.stringify(options.headers), options.body ?? '')
    } catch {
      nativeRequests.get(id)?.(0)
    }
  })
}
