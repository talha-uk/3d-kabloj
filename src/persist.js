const localBuffers = new Map()

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('duzenek', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idb(mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode)
    const result = run(tx.objectStore('kv'))
    tx.oncomplete = () => resolve(result?.result)
    tx.onerror = () => reject(tx.error)
  }))
}

function idbGet(key) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly')
    const request = tx.objectStore('kv').get(key)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  }))
}

function idbPut(key, value) {
  return idb('readwrite', (store) => store.put(value, key))
}

export function rememberBuffer(id, buffer) {
  localBuffers.set(id, buffer)
}

export async function uploadModel(file) {
  const buffer = await file.arrayBuffer()
  const headerName = encodeURIComponent(file.name)
  let meta = null
  try {
    const response = await fetch('/api/model', {
      method: 'POST',
      headers: { 'x-filename': headerName },
      body: buffer
    })
    if (response.ok) meta = await response.json()
  } catch {
    meta = null
  }
  if (!meta) {
    const id = crypto.randomUUID()
    meta = { id, file: `${id}.glb`, name: file.name.replace(/\.glb$/i, '') }
  }
  localBuffers.set(meta.id, buffer)
  try {
    await idbPut(`model:${meta.id}`, buffer)
  } catch {
    // Disk kaydı duruyorsa oturum sürer.
  }
  return meta
}

export async function modelBuffer(model) {
  if (localBuffers.has(model.id)) return localBuffers.get(model.id)
  try {
    const response = await fetch(`/modeller/${encodeURIComponent(model.file)}`)
    if (response.ok) {
      const buffer = await response.arrayBuffer()
      localBuffers.set(model.id, buffer)
      return buffer
    }
  } catch {
    // Yerel kopyaya düş.
  }
  const stored = await idbGet(`model:${model.id}`)
  if (stored) localBuffers.set(model.id, stored)
  return stored
}

export async function loadProject() {
  try {
    const response = await fetch('/api/proje')
    if (response.ok) {
      const data = await response.json()
      if (data && data.version === 1) return data
    }
  } catch {
    // Sunucu yoksa tarayıcı kaydı.
  }
  const stored = await idbGet('proje')
  return stored && stored.version === 1 ? stored : null
}

let timer = 0
let last = ''

export function saveProject(state) {
  const text = JSON.stringify(state)
  if (text === last) return
  last = text
  clearTimeout(timer)
  timer = setTimeout(() => {
    idbPut('proje', state).catch(() => {})
    fetch('/api/proje', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: text
    }).catch(() => {})
  }, 400)
}

export function downloadProject(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${state.name || '3d-kabloj'}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}
