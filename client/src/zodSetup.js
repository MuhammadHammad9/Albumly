// Zod normally speeds up validation by generating code with `new Function`. Our Content Security
// Policy forbids that (script-src 'self', no 'unsafe-eval'), and even zod's harmless "is it allowed?"
// test shows up as a CSP violation. Turning it off costs a little speed on large imports only.
// Imported first in main.jsx, before any schema is used.
import { z } from 'zod'

z.config({ jitless: true })
