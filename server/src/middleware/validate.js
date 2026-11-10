import { badRequest } from '../utils/errors.js'

// Checks a value against a zod schema. Returns the cleaned value, or throws a 400 that says
// which field is wrong, e.g. "rating: Must be 1 to 10".
export function parse(schema, value) {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const where = issue.path.join('.')
  throw badRequest(where ? `${where}: ${issue.message}` : issue.message)
}
