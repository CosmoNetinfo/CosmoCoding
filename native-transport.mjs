import { handleApi } from './api.mjs'

export function request(operation, body) {
  const pathname = '/api/' + operation
  return handleApi({
    method: 'POST',
    url: location.origin + pathname,
    headers: new Headers({ origin: location.origin, 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body)
  }, pathname)
}
