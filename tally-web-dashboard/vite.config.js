import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'
import tallySyncHandler from './api/tally/sync.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const rawJlsApiBaseUrl = String(env.JLS_API_BASE_URL || env.VITE_JLS_API_BASE_URL || '').trim()
    const rawSupabaseUrl = String(env.VITE_SUPABASE_URL || '').trim()
    const server = {
        port: 3000,
        proxy: {},
    }

    if (rawJlsApiBaseUrl) {
        server.proxy['/api/handoff'] = {
            target: rawJlsApiBaseUrl.replace(/\/$/, ''),
            changeOrigin: true,
            secure: true,
        }
    }

    // Supabase handles CORS natively, no dev proxy needed for its APIs.
    // If you still need to proxy specific backend endpoints, add them here.

    return {
        base: './',
        plugins: [tallyApiDevPlugin(), react()],
        server,
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
    }
})

function tallyApiDevPlugin() {
    return {
        name: 'tally-api-dev',
        configureServer(devServer) {
            devServer.middlewares.use(async (req, res, next) => {
                if (!req.url?.startsWith('/api/tally/sync')) {
                    next()
                    return
                }

                try {
                    const requestUrl = new URL(req.url, 'http://localhost')
                    const body = req.method === 'POST' ? await readJsonBody(req) : undefined
                    const adaptedReq = {
                        ...req,
                        method: req.method,
                        query: Object.fromEntries(requestUrl.searchParams.entries()),
                        body,
                    }
                    const adaptedRes = createJsonResponseAdapter(res)
                    await tallySyncHandler(adaptedReq, adaptedRes)
                } catch (error) {
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({
                        ok: false,
                        status: 'offline',
                        error: error?.message || 'Local Tally API failed',
                    }))
                }
            })
        },
    }
}

function createJsonResponseAdapter(res) {
    let statusCode = 200
    return {
        setHeader: (name, value) => res.setHeader(name, value),
        status(code) {
            statusCode = code
            return this
        },
        json(payload) {
            res.statusCode = statusCode
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
        },
    }
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let raw = ''
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
            raw += chunk
        })
        req.on('end', () => {
            if (!raw.trim()) {
                resolve({})
                return
            }
            try {
                resolve(JSON.parse(raw))
            } catch (error) {
                reject(error)
            }
        })
        req.on('error', reject)
    })
}
