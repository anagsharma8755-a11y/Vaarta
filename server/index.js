import { createAnalysisServer } from './app.js'
import { readConfig } from './config.js'

const { port } = readConfig()
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port number.')
const server = createAnalysisServer()
server.listen(port, '127.0.0.1', () => console.log(`NVIDIA analysis server listening on http://127.0.0.1:${port}`))
server.on('error', (error) => { console.error(`Analysis server could not start (${error.code}).`); process.exitCode = 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections() })
