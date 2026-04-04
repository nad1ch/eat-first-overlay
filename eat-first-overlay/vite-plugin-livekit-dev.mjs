/**
 * Dev-only POST /__livekit/token — видає JWT, якщо в .env.local задано LIVEKIT_API_KEY / LIVEKIT_API_SECRET.
 * У проді використовуйте VITE_LIVEKIT_TOKEN_URL на ваш бекенд або Vercel api/livekit-token.js.
 */
export function liveKitDevTokenPlugin() {
  return {
    name: 'livekit-dev-token',
    configureServer(server) {
      server.middlewares.use('/__livekit/token', (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }
        const apiKey = process.env.LIVEKIT_API_KEY
        const apiSecret = process.env.LIVEKIT_API_SECRET
        if (!apiKey || !apiSecret) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local for dev tokens.',
            }),
          )
          return
        }

        let raw = ''
        req.on('data', (c) => {
          raw += c
        })
        req.on('end', async () => {
          try {
            const { AccessToken } = await import('livekit-server-sdk')
            const json = JSON.parse(raw || '{}')
            const roomName = String(json.roomName ?? '').trim()
            const identity = String(json.identity ?? '').trim()
            const name = String(json.name ?? identity).trim().slice(0, 128)
            const canPublish = Boolean(json.canPublish)
            if (!roomName || !identity) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'roomName and identity required' }))
              return
            }

            const at = new AccessToken(apiKey, apiSecret, {
              identity,
              name: name || identity,
            })
            at.addGrant({
              roomJoin: true,
              room: roomName,
              canPublish,
              canSubscribe: true,
              canPublishData: true,
            })
            const token = await at.toJwt()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ token }))
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : String(e),
              }),
            )
          }
        })
      })
    },
  }
}
