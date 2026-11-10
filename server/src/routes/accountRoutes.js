import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as repo from '../services/library/libraryRepository.js'
import { ApiError } from '../utils/errors.js'

// /api/me: who is signed in, and deleting the account with all of its data
export function createAccountRoutes({ verify, db, authAdmin }, limits) {
  const router = Router()
  const auth = requireAuth(verify)

  // Runs fn as the signed-in user and turns database errors into the API's error shape
  const asUser = (req, fn) => db.asUser(req.user.id, (tx) => fn(tx, req.user.id)).catch((error) => Promise.reject(repo.toApiError(error)))

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
