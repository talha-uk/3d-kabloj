import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const proje = path.join(root, 'proje')
const modeller = path.join(proje, 'modeller')

function read(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function safeName(name) {
  return path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g, '_') || 'model.glb'
}

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  plugins: [
    {
      name: 'duzenek-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            const url = (req.url || '').split('?')[0]
            if (url === '/api/proje' && req.method === 'GET') {
              const file = path.join(proje, 'duzenek.json')
              res.setHeader('content-type', 'application/json')
              res.end(fs.existsSync(file) ? fs.readFileSync(file) : 'null')
              return
            }
            if (url === '/api/proje' && req.method === 'PUT') {
              const body = await read(req)
              JSON.parse(body.toString('utf8'))
              fs.mkdirSync(proje, { recursive: true })
              fs.writeFileSync(path.join(proje, 'duzenek.json'), body)
              res.end('ok')
              return
            }
            if (url === '/api/model' && req.method === 'POST') {
              const body = await read(req)
              const original = safeName(decodeURIComponent(req.headers['x-filename'] || 'model.glb'))
              const id = crypto.randomUUID()
              const file = `${id}.glb`
              fs.mkdirSync(modeller, { recursive: true })
              fs.writeFileSync(path.join(modeller, file), body)
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({
                id,
                file,
                name: original.replace(/\.glb$/i, '')
              }))
              return
            }
            if (url.startsWith('/modeller/') && req.method === 'GET') {
              const file = safeName(decodeURIComponent(url.slice('/modeller/'.length)))
              const full = path.join(modeller, file)
              if (!fs.existsSync(full)) {
                res.statusCode = 404
                res.end('yok')
                return
              }
              res.setHeader('content-type', 'model/gltf-binary')
              fs.createReadStream(full).pipe(res)
              return
            }
            next()
          } catch (err) {
            res.statusCode = 400
            res.end(err instanceof Error ? err.message : String(err))
          }
        })
      }
    }
  ]
})
