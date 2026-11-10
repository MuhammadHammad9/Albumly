// One small database interface with two engines behind it:
// - real Postgres (Supabase) through the `pg` driver, used by the running server
// - PGlite (Postgres compiled to WebAssembly, inside Node), used by the tests
// Both understand the same SQL and `$1` parameters, so the queries are written once.
//
// The interface: query(sql, params) → { rows, rowCount }, exec(sql) for several statements,
// transaction(fn), asUser(userId, fn) and close().

// Runs fn inside a transaction as one signed-in user. Postgres then applies the RLS policies to
// every query in fn, exactly as Supabase does for its own Data API.
async function runAsUser(tx, userId, fn) {
  await tx.query('set local role authenticated')
  await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })])
  return fn(tx)
}

export async function createPgDatabase({ connectionString, ssl, max = 5 }) {
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString, ssl, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 })
  // An idle connection dropped by the network must not crash the server
  pool.on('error', (error) => console.error(`Database connection error: ${error.message}`))

  const wrap = (client) => ({
    query: (text, params) => client.query(text, params),
    exec: (text) => client.query(text),
  })

  async function transaction(fn) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      const result = await fn(wrap(client))
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  return {
    query: (text, params) => pool.query(text, params),
    exec: (text) => pool.query(text),
    transaction,
    asUser: (userId, fn) => transaction((tx) => runAsUser(tx, userId, fn)),
    close: () => pool.end(),
  }
}

// PGlite answers with { rows, affectedRows }; rename to match pg
const pgliteResult = (result) => ({ rows: result.rows, rowCount: result.affectedRows ?? result.rows.length })

export function createPgliteDatabase(pglite) {
  const wrap = (target) => ({
    query: async (text, params) => pgliteResult(await target.query(text, params)),
    exec: (text) => target.exec(text),
  })
  const transaction = (fn) => pglite.transaction((tx) => fn(wrap(tx)))

  return {
    ...wrap(pglite),
    transaction,
    asUser: (userId, fn) => transaction((tx) => runAsUser(tx, userId, fn)),
    close: () => pglite.close(),
  }
}
