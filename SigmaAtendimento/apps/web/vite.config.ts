import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const apiTarget = 'http://127.0.0.1:3334'
const certificateKey = fileURLToPath(new URL('../../.local-certs/sigma-local-key.pem', import.meta.url))
const certificate = fileURLToPath(new URL('../../.local-certs/sigma-local-cert.pem', import.meta.url))
const useHttps = process.env.SIGMA_HTTPS === 'true'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        https: useHttps
            ? {
                key: readFileSync(certificateKey),
                cert: readFileSync(certificate),
            }
            : undefined,
        proxy: {
            '/api': {
                target: apiTarget,
                changeOrigin: true,
            },
            '/socket.io': {
                target: apiTarget,
                changeOrigin: true,
                ws: true,
            },
        },
    },
    resolve: {
        alias: {
            '@sigma/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
                            return 'vendor-react'
                        }
                        if (id.includes('socket.io-client')) {
                            return 'vendor-realtime'
                        }
                        if (id.includes('lucide-react')) {
                            return 'vendor-icons'
                        }
                        return 'vendor'
                    }
                    return undefined
                },
            },
        },
    },
})
