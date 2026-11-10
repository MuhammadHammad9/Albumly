import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import * as repo from '../services/library/libraryRepository.js'
import { ApiError } from '../utils/errors.js'

// /api/me: who is signed in, and deleting the account with all of its data
const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(72),
})

export function createAccountRoutes({ verify, db, authAdmin, instantSignup = false }, limits) {
  const router = Router()
  const auth = requireAuth(verify)

  // Runs fn as the signed-in user and turns database errors into the API's error shape
  const asUser = (req, fn) => db.asUser(req.user.id, (tx) => fn(tx, req.user.id)).catch((error) => Promise.reject(repo.toApiError(error)))

  // Sign-up without a confirmation email (only when SIGNUP_EMAIL_CONFIRMATION=off). The browser
  // signs in with Supabase straight after. Without this route the browser uses Supabase's own
  // sign-up, which emails a confirmation link.
  if (instantSignup) {
    router.post('/auth/signup', limits.signup, async (req, res) => {
      const parsed = signupSchema.safeParse(req.body)
      if (!parsed.success) throw new ApiError(400, 'invalid_signup', 'Enter a valid email and a password of 8 to 72 characters.')
      const { email, password } = parsed.data

      const created = await authAdmin.createConfirmedUser(email, password)
      if (created.weakPassword) throw new ApiError(400, 'weak_password', 'Choose a stronger password.')
      if (created.exists) {
        // An account left unconfirmed by an earlier sign-up (its email never arrived) has never
        // been used, so it holds no data: let this sign-up finish it. A used account is refused.
        const { rows } = await db.query(
          'select id, email_confirmed_at, last_sign_in_at from auth.users where lower(email) = $1 limit 1',
          [email],
        )
        const user = rows[0]
        if (!user || user.email_confirmed_at || user.last_sign_in_at) {
          throw new ApiError(409, 'user_already_exists', 'An account with this email already exists. Try signing in.')
        }
        await authAdmin.confirmUser(user.id, password)
      }
      res.status(201).json({ ok: true })
    })
  }

  router.get('/me', auth, async (req, res) => {
    const { profile, counts } = await asUser(req, async (tx, userId) => ({
      profile: await repo.ensureProfile(tx, userId),
      counts: await repo.countLibrary(tx, userId),
    }))
    res.json({ user: { id: req.user.id, email: req.user.email }, profile, counts })
  })

  // Deletes the user's rows first (so nothing depends on the cascade alone), then the account
  // itself. Running it again after a failure finishes the job.
  router.delete('/me', limits.deleteAccount, auth, async (req, res) => {
    await asUser(req, repo.deleteAllUserData)
    try {
      await authAdmin.deleteUser(req.user.id)
    } catch {
      throw new ApiError(502, 'account_delete_failed', 'Your library was deleted, but the account itself could not be removed. Please try again.')
    }
    res.status(204).end()
  })

  return router
}
