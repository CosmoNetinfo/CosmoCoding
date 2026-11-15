import test from 'node:test'
import assert from 'node:assert/strict'
import { handleApi } from '../api.mjs'
import { starter, workflowPath } from '../template.mjs'

const origin = 'https://workspace.example'
const send = (route, payload, from = origin) => handleApi(new Request(origin + route, {
  method: 'POST', headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify(payload)
}), route)

test('blocca richieste da un’origine diversa prima di contattare i provider', async t => {
  const remote = t.mock.method(globalThis, 'fetch', () => { throw Error('Chiamata inattesa') })
  const response = await send('/api/models', {}, 'https://another.example')
  assert.equal(response.status, 403)
  assert.equal(remote.mock.callCount(), 0)
})

test('Android usa lo stesso connettore attraverso il bridge nativo', async t => {
  const bridge = {
    send(id, url, method, headers, body) {
      assert.equal(url, 'https://api.supabase.com/v1/projects')
      assert.equal(method, 'GET')
      assert.deepEqual(JSON.parse(headers), { authorization: 'Bearer fixture-token' })
      assert.equal(body, '')
      queueMicrotask(() => globalThis.cosmoNativeReply(id, 200, JSON.stringify([
        { name: 'Progetto test', ref: 'test', region: 'eu-west-1', status: 'ACTIVE_HEALTHY' }
      ])))
    }
  }
  globalThis.CosmoNative = bridge
  t.after(() => {
    delete globalThis.CosmoNative
    delete globalThis.cosmoNativeReply
  })
  const response = await send('/api/supabase', { token: 'fixture-token' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).projects[0].name, 'Progetto test')
})

test('Vercel legge progetti e deploy nel team selezionato senza restituire configurazione privata', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', (url, { method, headers }) => {
    assert.equal(headers.authorization, 'Bearer fixture-vercel')
    assert.equal(method, 'GET')
    const endpoint = new URL(url)
    assert.equal(endpoint.origin, 'https://api.vercel.com')
    requests.push(endpoint)
    if (endpoint.pathname === '/v10/projects') {
      return Response.json({ projects: [{ id: 'prj_example', name: 'Progetto', env: [{ value: 'privato' }] }],
        pagination: { next: 1690000000000 } })
    }
    assert.equal(endpoint.pathname, '/v7/deployments')
    return Response.json({ deployments: [
      { uid: 'one', readyState: 'READY', target: 'production', url: 'project.vercel.app',
        createdAt: 1690000000000, meta: { githubCommitRef: 'main', other: 'privato' } },
      { uid: 'two', state: 'BUILDING', url: 'project.vercel.app.invalid' }
    ] })
  })
  const account = { token: 'fixture-vercel', scope: 'team_example' }
  const projects = await send('/api/vercel-projects', account)
  assert.equal(projects.status, 200)
  assert.deepEqual(await projects.json(), { projects: [{ id: 'prj_example', name: 'Progetto' }], next: 1690000000000 })
  const deployments = await send('/api/vercel-deployments', {
    token: account.token, scope: 'cosmo-team', project: 'prj_example', cursor: 1690000000000
  })
  assert.equal(deployments.status, 200)
  assert.equal(requests[0].searchParams.get('teamId'), 'team_example')
  assert.equal(requests[1].searchParams.get('slug'), 'cosmo-team')
  assert.equal(requests[1].searchParams.get('projectId'), 'prj_example')
  assert.equal(requests[1].searchParams.get('until'), '1690000000000')
  assert.deepEqual(await deployments.json(), { deployments: [
    { id: 'one', state: 'READY', target: 'production', createdAt: 1690000000000, branch: 'main',
      url: 'https://project.vercel.app' },
    { id: 'two', state: 'BUILDING', url: null }
  ], next: null })
})

test('invia i file al provider scelto e scarta i percorsi estranei', async t => {
  t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    const { store, input } = JSON.parse(options.body)
    assert.equal(store, false)
    assert.equal(JSON.parse(input).files[0].path, 'lib/main.dart')
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({
      summary: 'Una modifica', files: [{ path: 'altro.dart', content: 'void main() {}' }]
    }) }] }] })
  })
  const response = await send('/api/generate', {
    provider: 'openai', key: 'fixture-key', model: 'gpt-example', prompt: 'Modifica la home',
    files: [{ path: 'lib/main.dart', content: 'void main() {}' }]
  })
  assert.equal(response.status, 422)
  assert.match((await response.json()).error, /fuori dalla selezione/)
})

test('rifiuta una PR se il branch base è cambiato e non invia scritture', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', (url, options) => {
    calls.push(options.method)
    if (url.includes('/pulls?')) return Response.json([])
    return Response.json({ object: { sha: 'b'.repeat(40) } })
  })
  const response = await send('/api/publish', {
    token: 'fixture-token', repo: 'owner/project', branch: 'main', sha: 'a'.repeat(40),
    title: 'Una modifica', files: [{ path: 'lib/main.dart', content: 'void main() {}' }]
  })
  assert.equal(response.status, 409)
  assert.deepEqual(calls, ['GET', 'GET'])
})

test('pubblica un commit multi-file su un branch dedicato e recupera una PR già aperta', async t => {
  const parent = 'a'.repeat(40), before = 'b'.repeat(40), after = 'c'.repeat(40), commit = 'd'.repeat(40)
  const repo = 'owner/project'
  let expectedHead
  let created = false
  const writes = []
  const pull = { html_url: 'https://github.com/owner/project/pull/3', number: 3, state: 'open' }
  t.mock.method(globalThis, 'fetch', (url, { method, body }) => {
    const path = url.split('/repos/' + repo)[1]
    if (method === 'POST') writes.push(path)
    if (path.startsWith('/pulls?')) return Response.json(created ? [pull] : [])
    if (path === '/git/ref/heads/main') return Response.json({ object: { sha: parent } })
    if (path === '/git/commits/' + parent) return Response.json({ tree: { sha: before } })
    if (path === '/git/trees/' + before + '?recursive=1') return Response.json({ tree: [
      { path: 'a.txt', type: 'blob', mode: '100644' }, { path: 'b.sh', type: 'blob', mode: '100755' }
    ] })
    if (path === '/git/trees') {
      assert.deepEqual(JSON.parse(body).tree.map(file => file.mode), ['100644', '100755'])
      return Response.json({ sha: after })
    }
    if (path.startsWith('/git/ref/heads/vibedock/')) return Response.json({}, { status: 404 })
    if (path === '/git/commits') return Response.json({ sha: commit })
    if (path === '/git/refs') {
      expectedHead = JSON.parse(body).ref.replace('refs/heads/', '')
      return Response.json({ object: { sha: commit } })
    }
    if (path === '/git/commits/' + commit) return Response.json({ tree: { sha: after }, parents: [{ sha: parent }] })
    if (path === '/pulls') {
      assert.equal(JSON.parse(body).head, expectedHead)
      created = true
      return Response.json(pull)
    }
    throw Error(path)
  })
  const payload = {
    token: 'fixture-token', repo, branch: 'main', sha: parent, title: 'Due modifiche',
    files: [{ path: 'b.sh', content: 'echo ciao' }, { path: 'a.txt', content: 'ciao' }]
  }
  assert.deepEqual(await (await send('/api/publish', payload)).json(), { url: pull.html_url, number: 3, state: 'open' })
  assert.equal((await send('/api/publish', payload)).status, 200)
  assert.deepEqual(writes, ['/git/trees', '/git/commits', '/git/refs', '/pulls'])
})

test('il modello contiene un workflow manuale per i quattro pacchetti', () => {
  const workflow = starter.find(file => file.path === workflowPath).content
  assert.match(workflow, /workflow_dispatch/)
  assert.match(workflow, /runs-on: \$\{\{ matrix\.runner \}\}/)
  for (const name of ['app-debug.apk', 'VibeDockApp-macOS-arm64.dmg', 'vibedock-app-linux-amd64.deb', 'ISCC.exe']) {
    assert.ok(workflow.includes(name), name)
  }
  assert.match(workflow, /\$\{#apps\[@\]\}/)
})
