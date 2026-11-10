import 'dotenv/config'
import { createApp } from './app.js'
import { createAccounts, readAccountsConfig } from './config/accounts.js'
import { getProvider } from './providers/index.js'

// Hosting platforms inject PORT, so it is honoured in production only. In development some
// tools set PORT for the client dev server, which would make the API collide with Vite.
const hostPort = process.env.NODE_ENV === 'production' ? process.env.PORT : undefined
const PORT = process.env.API_PORT || hostPort || 5000

// Fail at startup, with a clear message, if the catalogue is misconfigured (e.g. missing Spotify keys)
let provider
try {
  provider = getProvider()
} catch (error) {
  console.error(`Albumly API cannot start: ${error.message}`)
  process.exit(1)
}

// Accounts are optional: without the Supabase settings the API runs in local-only mode, exactly
// as before. Only variable names are printed, never their values.
let accounts = null
const accountsConfig = readAccountsConfig()
if (accountsConfig.ok) {
  try {
    accounts = await createAccounts(accountsConfig)
  } catch (error) {
    console.error(`Accounts disabled: ${error.message}`)
  }
} else {
  console.log(`Accounts disabled: ${accountsConfig.problem ?? `${accountsConfig.missing.join(', ')} not set`}`)
}

// TRUST_PROXY: how many proxies sit in front of the API when hosted ("1" on most platforms)
const rawTrust = process.env.TRUST_PROXY?.trim()
const trustProxy = rawTrust ? (/^\d+$/.test(rawTrust) ? Number(rawTrust) : rawTrust) : undefined

createApp({ accounts, trustProxy }).listen(PORT, () => {
  console.log(`Albumly API listening on http://localhost:${PORT} (catalogue: ${provider.name}, accounts: ${accounts ? 'on' : 'off'})`)
})
