// Starts a second API on port 5055 that always serves the demo catalogue, whatever server/.env
// says. Used by `npm run dev:demo` to try features without spending Spotify requests.
// dotenv never overrides variables that are already set, so these win over server/.env.
process.env.CATALOG_PROVIDER = 'mock'
process.env.API_PORT = '5055'
process.env.CLIENT_ORIGIN = 'http://localhost:5199'

await import('../src/server.js')
