import s from '../components/account/account.module.css'
import { PRIVACY_CONTACT } from '../config/privacy.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import p from './pages.module.css'

export default function Privacy() {
  usePageTitle('Privacy')
  return (
    <article className={s.prose}>
      <h1 className={p.pageTitle}>Privacy policy</h1>
      <p>Albumly is an independent project. This page explains, in plain words, what it stores about you and how to remove it.</p>

      <h2>Without an account</h2>
      <p>
        Everything you save (albums, ratings, reviews, notes, tags, collections) and your recent searches stay in this browser's local storage. Nothing is
        sent to us. Clearing this site's data in your browser removes it.
      </p>

      <h2>With an account</h2>
      <ul>
        <li>Your email address and password, held by our sign-in provider, Supabase. Passwords are stored only as a secure hash.</li>
        <li>Your library: saved albums with a small copy of their details (title, artists, cover link, release date), your ratings, reviews, notes, tags and collections.</li>
        <li>On this device: your sign-in session and a copy of your library so it opens quickly and works offline.</li>
      </ul>
      <p>The data is stored in a Supabase database. It is used only to run Albumly for you. We do not sell it, share it, show ads or use tracking.</p>

      <h2>Sharing, battles and reports</h2>
      <ul>
        <li>
          If you share a collection, its name, description and album list are visible to anyone with the link. Your ratings and reviews are included only if
          you turn that on. Your private notes, tags and statuses are never shared.
        </li>
        <li>Battle votes are stored with your account so you can vote only once. Everyone sees only the totals, never who voted for what.</li>
        <li>If you report a shared collection or review, the moderators see your report.</li>
        <li>
          The server counts requests and the most common searches to keep Albumly running well. Searches are counted only as text and a number, never with
          who searched, and a search is only shown to the admin once it has been made at least 3 times.
        </li>
      </ul>

      <h2>Music data</h2>
      <p>Album and artist information comes from Spotify and links back to it. Albumly never asks you to sign in to Spotify and never sees your Spotify account.</p>

      <h2>Deleting your data</h2>
      <p>
        Account → Delete account removes your account and everything saved in it, immediately and permanently: your library, your shared links, your
        votes and your reports. Battles you started stay, but are no longer linked to you. Signing out removes the copy of your account library from that
        device.
      </p>

      <h2>Contact</h2>
      <p>Questions about your data: {PRIVACY_CONTACT}</p>
    </article>
  )
}
