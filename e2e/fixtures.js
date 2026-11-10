// Every spec imports `test` and `expect` from here instead of from @playwright/test.
// The extra rule: a test fails if the page throws an uncaught error, or logs console.error,
// unless the test expects errors (test.use({ allowConsoleErrors: true })).
import { test as base, expect } from '@playwright/test'

// Messages that are not app bugs: the browser reporting a 4xx/5xx that a test caused on purpose
const IGNORED = [/Failed to load resource/i]

export const test = base.extend({
  allowConsoleErrors: [false, { option: true }],
  page: async ({ page, allowConsoleErrors }, use) => {
    const problems = []
    page.on('pageerror', (error) => problems.push(`Uncaught: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error' || allowConsoleErrors) return
      if (IGNORED.some((pattern) => pattern.test(message.text()))) return
      problems.push(`console.error: ${message.text()}`)
    })
    await use(page)
    expect(problems, 'the page logged errors').toEqual([])
  },
})

export { expect }
