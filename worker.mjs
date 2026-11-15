const assets = /* ASSET_MAP */ null
const security = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cache-control': 'no-store'
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/')) return handleApi(request, pathname)
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: security })
    if (!Object.hasOwn(assets, pathname)) return new Response('Pagina non trovata', { status: 404, headers: security })
    const [mime, data] = assets[pathname]
    const body = mime === 'image/png' ? Uint8Array.from(atob(data), character => character.charCodeAt(0)) : data
    return new Response(request.method === 'HEAD' ? null : body, { headers: { ...security, 'content-type': mime } })
  }
}
