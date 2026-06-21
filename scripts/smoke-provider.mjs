#!/usr/bin/env node

const baseUrl = process.env.GRACE_PROVIDER_BASE_URL
const apiKey = process.env.GRACE_PROVIDER_API_KEY

if (!baseUrl || !apiKey) {
  console.error('Usage: GRACE_PROVIDER_BASE_URL=https://api.example.com/v1 GRACE_PROVIDER_API_KEY=... node scripts/smoke-provider.mjs')
  process.exit(1)
}

const endpoint = `${baseUrl.trim().replace(/\/+$/, '')}/models`
const response = await fetch(endpoint, {
  headers: {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json'
  }
})

if (!response.ok) {
  const body = await response.text()
  console.error(`Provider models smoke failed: HTTP ${response.status}. ${body.slice(0, 240)}`)
  process.exit(1)
}

const payload = await response.json()
const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
const ids = rows.map((row) => row?.id).filter(Boolean)

if (ids.length === 0) {
  console.error('Provider models smoke failed: no model ids returned.')
  process.exit(1)
}

console.log(`Provider models smoke passed: ${ids.length} models returned.`)
