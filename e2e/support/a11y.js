import { writeFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

// Runs the axe accessibility rules on the current page and attaches the full report to the test.
// Returns the violations so the test decides what fails (Part A: only "critical").
export async function runAxe(page, testInfo, name) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, where: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)) }))
  const body = JSON.stringify(summary, null, 2)
  await testInfo.attach(`axe-${name}.json`, { body, contentType: 'application/json' })
  // Also kept as a file in e2e/test-results, so the findings can be read without opening the report
  await writeFile(testInfo.outputPath(`axe-${name}.json`), body)
  return results.violations
}
