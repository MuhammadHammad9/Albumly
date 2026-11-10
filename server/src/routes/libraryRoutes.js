import express, { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { parse } from '../middleware/validate.js'
import {
  albumId,
  collectionId,
  collectionPatchSchema,
  entrySchema,
  importSchema,
  membershipSchema,
  newCollectionSchema,
  orderSchema,
} from '../schemas/library.js'
import * as repo from '../services/library/libraryRepository.js'
import { badRequest } from '../utils/errors.js'

// The personal library in the account. Every route needs a signed-in user, and every query runs
// as that user, so someone else's collection simply "does not exist" (404), never "forbidden".
// Every write can safely be sent twice: the client retries after network failures.
export function createLibraryRoutes({ verify, db }, limits) {
  const router = Router()
  const auth = requireAuth(verify)

  const asUser = (req, fn) => db.asUser(req.user.id, (tx) => fn(tx, req.user.id)).catch((error) => Promise.reject(repo.toApiError(error)))

  // The ids in the address are checked like any other input
  router.param('albumId', (req, res, next, value) => {
    parse(albumId, value)
    next()
  })
  router.param('collectionId', (req, res, next, value) => {
    parse(collectionId, value)
    next()
  })

  // ---------- whole library ----------

  router.get('/library', auth, async (req, res) => {
    res.json(await asUser(req, repo.getLibrary))
  })

  // Uploads a browser's library and merges it in (newest change wins)
  // The body is read only after the limit and the sign-in check (see app.js)
  router.post('/library/import', limits.import, auth, express.json({ limit: '5mb' }), async (req, res) => {
    const { library } = parse(importSchema, req.body)
    res.json(await asUser(req, (tx, userId) => repo.importLibrary(tx, userId, library)))
  })

  // ---------- one saved album ----------

  router.put('/albums/:albumId/entry', auth, async (req, res) => {
    const entry = parse(entrySchema, req.body)
    if (entry.album.id !== req.params.albumId) throw badRequest('album.id: Must match the album id in the address')
    res.json(await asUser(req, (tx, userId) => repo.upsertEntry(tx, userId, req.params.albumId, entry)))
  })

  router.delete('/albums/:albumId/entry', auth, async (req, res) => {
    await asUser(req, (tx, userId) => repo.deleteEntry(tx, userId, req.params.albumId))
    res.status(204).end()
  })

  // ---------- collections ----------

  router.get('/collections', auth, async (req, res) => {
    res.json({ collections: await asUser(req, repo.listCollections) })
  })

  router.post('/collections', auth, async (req, res) => {
    const collection = parse(newCollectionSchema, req.body)
    const result = await asUser(req, (tx, userId) => repo.createCollection(tx, userId, collection))
    res.status(result.created ? 201 : 200).json({ collection: result.collection })
  })

  router.get('/collections/:collectionId', auth, async (req, res) => {
    res.json({ collection: await asUser(req, (tx, userId) => repo.getCollection(tx, userId, req.params.collectionId)) })
  })

  router.patch('/collections/:collectionId', auth, async (req, res) => {
    const changes = parse(collectionPatchSchema, req.body)
    res.json(await asUser(req, (tx, userId) => repo.updateCollection(tx, userId, req.params.collectionId, changes)))
  })

  router.delete('/collections/:collectionId', auth, async (req, res) => {
    await asUser(req, (tx, userId) => repo.deleteCollection(tx, userId, req.params.collectionId))
    res.status(204).end()
  })

  router.post('/collections/:collectionId/albums', auth, async (req, res) => {
    const { albumId: id } = parse(membershipSchema, req.body)
    res.json({ collection: await asUser(req, (tx, userId) => repo.addToCollection(tx, userId, req.params.collectionId, id)) })
  })

  router.delete('/collections/:collectionId/albums/:albumId', auth, async (req, res) => {
    await asUser(req, (tx, userId) => repo.removeFromCollection(tx, userId, req.params.collectionId, req.params.albumId))
    res.status(204).end()
  })

  router.patch('/collections/:collectionId/order', auth, async (req, res) => {
    const { albumIds, updatedAt } = parse(orderSchema, req.body)
    res.json({ collection: await asUser(req, (tx, userId) => repo.setCollectionOrder(tx, userId, req.params.collectionId, albumIds, updatedAt)) })
  })

  return router
}
