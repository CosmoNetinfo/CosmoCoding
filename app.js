const $ = id => document.getElementById(id)
const state = { auth: new Map(), selected: new Set(), contents: new Map(), snapshot: null, proposal: null }
const providerNames = { openai: 'GPT', claude: 'Claude', gemini: 'Gemini' }
let busy = false
let noticeTimer
const nativeTransport = typeof globalThis.CosmoNative?.send === 'function'
  ? import('/native-transport.mjs') : null

function node(tag, text, className) {
  const item = document.createElement(tag)
  if (text !== undefined) item.textContent = text
  if (className) item.className = className
  return item
}

function link(text, url) {
  const item = node('a', text)
  const target = new URL(url)
  if (target.protocol === 'https:' && ['github.com', 'supabase.com'].includes(target.hostname)) item.href = target.href
  item.target = '_blank'
  item.rel = 'noopener'
  return item
}

function tab(id) {
  for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== id
  for (const button of document.querySelectorAll('nav [data-tab]')) {
    if (button.dataset.tab === id) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  window.scrollTo({ top: 0 })
}

function notice(text, error = false) {
  clearTimeout(noticeTimer)
  $('notice').textContent = text
  $('notice').dataset.error = error
  $('notice').hidden = false
  noticeTimer = setTimeout(() => { $('notice').hidden = true }, error ? 11000 : 4400)
}

function run(callback, button, label = 'Attendi…') {
  return async event => {
    event.preventDefault()
    if (busy) return
    busy = true
    const submit = button || event.submitter || event.currentTarget.querySelector('[type=submit]')
    const children = submit ? Array.from(submit.childNodes) : []
    try {
      if (submit) {
        submit.disabled = true
        submit.textContent = label
      }
      await callback(event)
    } catch (error) {
      notice(error.message || 'Operazione non riuscita.', true)
    } finally {
      if (submit) {
        submit.replaceChildren(...children)
        submit.disabled = false
      }
      busy = false
    }
  }
}

async function api(operation, body) {
  const result = nativeTransport
    ? await (await nativeTransport).request(operation, body)
    : await fetch('/api/' + operation, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
  const data = await result.json().catch(() => null)
  if (!result.ok || !data) throw new Error(data?.error || 'Il server non ha risposto. Ricarica la pagina e riprova.')
  return data
}

function context() {
  if (!state.snapshot) throw new Error('Apri prima un repository in Connessioni.')
  const { repo, token, base, sha } = state.snapshot
  return { repo, token, branch: base, sha }
}

function options(id, values) {
  $(id).replaceChildren(...values.map(value => {
    const option = node('option')
    option.value = value
    return option
  }))
}

function selectModel() {
  const name = $('provider').value
  const auth = state.auth.get(name)
  const suggested = ['gpt-5-mini', 'gpt-4.1-mini', 'gemini-2.5-flash'].find(id => auth?.models.includes(id))
    || auth?.models.find(id => name === 'claude' && id.startsWith('claude-sonnet-'))
  options('models', auth?.models || [])
  $('model').value = suggested || auth?.models[0] || ''
  $('model-hint').textContent = auth
    ? 'I file selezionati vengono inviati a ' + providerNames[name] + '.'
    : 'Aggiungi la chiave API di ' + providerNames[name] + ' in Connessioni.'
}

function renderFiles() {
  const stateFiles = state.snapshot?.files || []
  const search = $('search').value.trim().toLowerCase()
  const found = stateFiles.filter(path => path.toLowerCase().includes(search))
  $('context-count').textContent = state.selected.size + ' file'
  $('files-list').replaceChildren(...found.slice(0, 80).map(path => {
    const row = node('div', undefined, 'item')
    const label = node('label')
    const check = node('input')
    check.type = 'checkbox'
    check.checked = state.selected.has(path)
    check.addEventListener('change', () => {
      if (check.checked && state.selected.size >= 8) {
        check.checked = false
        notice('Seleziona al massimo otto file.', true)
        return
      }
      if (check.checked) state.selected.add(path)
      else state.selected.delete(path)
      $('context-count').textContent = state.selected.size + ' file'
    })
    label.append(check, node('span', path))
    const open = node('button', 'Apri', 'button compact')
    open.setAttribute('aria-label', 'Apri ' + path)
    open.onclick = run(async () => {
      $('preview-code').textContent = await contents(path)
      $('preview-title').textContent = path
      $('file-preview').hidden = false
      $('file-preview').scrollIntoView({ block: 'nearest' })
    }, open)
    row.append(label, open)
    return row
  }))
  const notes = []
  if (state.snapshot && !found.length) notes.push('Nessun file testuale corrispondente.')
  if (found.length > 80) notes.push('Primi 80 risultati su ' + found.length + '. Usa la ricerca per restringere l’elenco.')
  if (state.snapshot?.incomplete) notes.push('GitHub ha restituito un elenco parziale.')
  $('files-note').textContent = notes.join(' ')
}

async function contents(path) {
  if (!state.contents.has(path)) {
    const file = await api('file', { ...context(), path })
    state.contents.set(path, file.content)
  }
  return state.contents.get(path)
}

function diff(before, after) {
  const split = value => value === undefined ? [] : value.replace(/\r\n/g, '\n').split('\n')
  const left = split(before)
  const right = split(after)
  if (left.length * right.length > 400000) {
    return [...left.map(line => ['-', line]), ...right.map(line => ['+', line])]
  }
  const width = right.length + 1
  const table = new Uint32Array((left.length + 1) * width)
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      table[i * width + j] = left[i] === right[j]
        ? 1 + table[(i + 1) * width + j + 1]
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  const output = []
  let i = 0, j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      output.push([' ', left[i++]])
      j++
    } else if (i < left.length && (j === right.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) {
      output.push(['-', left[i++]])
    } else {
      output.push(['+', right[j++]])
    }
  }
  return output
}

function review(proposal) {
  state.proposal = proposal
  $('review').hidden = false
  $('summary').textContent = proposal.summary
  $('review-count').textContent = proposal.files.length + ' file'
  $('pr-result').hidden = true
  $('publish').hidden = proposal.mode === 'demo' || !proposal.files.length
  $('pr-title').value = proposal.mode === 'starter' ? 'Aggiungi app Flutter e build installabili' : ''
  $('changes').replaceChildren(...proposal.files.map((file, index) => {
    const wrapper = node('div', undefined, 'stack')
    const details = node('details')
    const heading = node('summary', file.path)
    const code = node('pre')
    details.open = index === 0 && proposal.mode === 'edit'
    details.append(heading, code)
    const draw = () => {
      if (!details.open || code.childNodes.length) return
      const lines = diff(state.contents.get(file.path), file.content)
      const fragment = document.createDocumentFragment()
      for (const [symbol, line] of lines) fragment.append(node('span', symbol + ' ' + line,
        symbol === '+' ? 'diff-added' : symbol === '-' ? 'diff-removed' : ''))
      code.append(fragment)
    }
    details.addEventListener('toggle', draw)
    draw()
    if (proposal.mode === 'edit') {
      const check = node('input')
      check.type = 'checkbox'
      check.checked = true
      check.addEventListener('change', () => {
        if (check.checked) proposal.accepted.add(file.path)
        else proposal.accepted.delete(file.path)
      })
      const label = node('label', undefined, 'item')
      label.append(node('span', 'Includi ' + file.path + ' nella PR'), check)
      wrapper.append(label)
    }
    wrapper.append(details)
    return wrapper
  }))
  tab('workspace')
  $('review').scrollIntoView({ block: 'start' })
}

async function starter(mode) {
  const result = await fetch('/starter.json')
  if (!result.ok) throw new Error('Modello Flutter non disponibile.')
  const files = await result.json()
  review({ mode, files, summary: 'Un progetto Flutter e un workflow manuale per creare i pacchetti installabili di Windows, macOS, Android e Linux.' })
}

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => tab(button.dataset.tab)))
$('search').addEventListener('input', renderFiles)
$('provider').addEventListener('change', selectModel)
$('demo').addEventListener('click', run(() => starter('demo'), $('demo')))
$('scaffold').addEventListener('click', run(() => starter('starter'), $('scaffold')))

$('list-repos').addEventListener('click', run(async () => {
  const data = await api('repos', { token: $('github-token').value.trim() })
  options('repos', data.repositories)
  if (!$('repo').value && data.repositories.length) $('repo').value = data.repositories[0]
  $('repo').focus()
  notice(data.repositories.length + ' repository disponibili nell’elenco.')
}, $('list-repos')))

$('connect-github').addEventListener('submit', run(async () => {
  const input = $('repo').value.trim()
  const repo = input.replace(/^https:\/\/github\.com\//i, '').replace(/\/$|\.git$/g, '')
  const token = $('github-token').value.trim()
  const data = await api('snapshot', { repo, token, branch: $('branch').value.trim() })
  state.snapshot = { ...data, repo, token }
  state.selected.clear()
  state.contents.clear()
  state.proposal = null
  $('review').hidden = true
  $('file-preview').hidden = true
  $('scaffold').hidden = !data.canScaffold
  $('search').value = ''
  $('search-label').hidden = false
  $('onboarding').hidden = true
  $('file-title').textContent = repo
  $('sidebar-repo').textContent = repo
  $('branch-label').textContent = data.base
  $('branch-label').hidden = false
  $('runs').replaceChildren(node('p', 'Usa Aggiorna per caricare le esecuzioni di ' + repo + '.', 'hint'))
  renderFiles()
  tab('files')
  notice('Repository aperto.')
}))

$('connect-model').addEventListener('submit', run(async () => {
  const provider = $('connect-provider').value
  const key = $('api-key').value.trim()
  const data = await api('models', { provider, key })
  state.auth.set(provider, { key, models: data.models })
  $('api-key').value = ''
  $('provider').value = provider
  $('registered-providers').textContent = state.auth.size + ' collegati'
  $('model-status').textContent = [...state.auth.keys()].map(name => providerNames[name]).join(', ') + ' · Collegati in questa scheda'
  selectModel()
  notice(providerNames[provider] + ' collegato.')
}))

$('generate').addEventListener('submit', run(async () => {
  const provider = $('provider').value
  const auth = state.auth.get(provider)
  if (!auth) throw new Error('Collega ' + providerNames[provider] + ' in Connessioni.')
  const prompt = $('prompt').value
  const model = $('model').value.trim()
  const selected = [...state.selected]
  const files = await Promise.all(selected.map(async path => ({ path, content: await contents(path) })))
  const data = await api('generate', { provider, key: auth.key, model, prompt, files })
  review({ ...data, mode: 'edit', accepted: new Set(data.files.map(file => file.path)) })
}, null, 'Generazione…'))

$('publish').addEventListener('submit', run(async () => {
  const proposal = state.proposal
  const files = proposal.mode === 'edit' ? proposal.files.filter(file => proposal.accepted.has(file.path)) : proposal.files
  if (!files.length) throw new Error('Seleziona almeno un file da includere nella pull request.')
  const result = await api('publish', { ...context(), mode: proposal.mode, files, title: $('pr-title').value, summary: proposal.summary })
  $('publish').hidden = true
  $('pr-result').replaceChildren(link('Apri la pull request #' + result.number + ' su GitHub ↗', result.url))
  $('pr-result').hidden = false
  notice('Pull request disponibile su GitHub.')
}, null, 'Invio a GitHub…'))

async function loadBuilds(launch) {
  const payload = context()
  const result = await api('builds', { ...payload, run: launch })
  if (result.started) {
    const row = node('div', undefined, 'item')
    row.append(link('Segui la build su GitHub ↗', result.url), node('span', 'Inviata'))
    $('runs').prepend(row)
    notice('Richiesta di build accettata da GitHub.')
    return
  }
  $('runs').replaceChildren(...result.runs.map(runItem => {
    const row = node('div', undefined, 'item')
    row.append(link('Build #' + runItem.number + ' ↗', runItem.url),
      node('span', [runItem.branch, runItem.conclusion || runItem.status].filter(Boolean).join(' · ')))
    return row
  }))
  if (!result.runs.length) $('runs').append(node('p', 'Nessuna esecuzione visibile. GitHub può impiegare qualche secondo.', 'hint'))
}
$('run-build').addEventListener('click', run(() => loadBuilds(true), $('run-build')))
$('refresh-build').addEventListener('click', run(() => loadBuilds(false), $('refresh-build')))

$('connect-supabase').addEventListener('submit', run(async () => {
  const { projects } = await api('supabase', { token: $('supabase-token').value.trim() })
  $('projects').replaceChildren(...projects.map(project => {
    const row = node('div', undefined, 'item')
    row.append(link(project.name + ' ↗', 'https://supabase.com/dashboard/project/' + encodeURIComponent(project.ref)),
      node('span', [project.region, project.status].filter(Boolean).join(' · ')))
    return row
  }))
  if (!projects.length) $('projects').append(node('p', 'Nessun progetto accessibile con questo token.', 'hint'))
  notice(projects.length + ' progetti Supabase caricati.')
}))

if (!nativeTransport && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
