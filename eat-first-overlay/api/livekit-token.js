/**
 * Vercel Serverless: POST { roomName, identity, name?, canPublish? } → { token }
 * Змінні середовища: LIVEKIT_API_KEY, LIVEKIT_API_SECRET (не комітити).
 */
import { AccessToken } from 'livekit-server-sdk'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method' })
    return
  }

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    res.status(503).json({ error: 'LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured' })
    return
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}')
    const roomName = String(body.roomName ?? '').trim()
    const identity = String(body.identity ?? '').trim()
    const name = String(body.name ?? identity).trim().slice(0, 128)
    const canPublish = Boolean(body.canPublish)

    if (!roomName || !identity) {
      res.status(400).json({ error: 'roomName and identity required' })
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
    res.status(200).json({ token })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
