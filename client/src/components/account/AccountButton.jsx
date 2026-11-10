import { UserRound } from 'lucide-react'
import { NavLink } from 'react-router'
import { useSession } from '../../stores/sessionStore.js'
import s from './account.module.css'

// Top-right link to the Account page: an icon when signed out, the email's first letter when signed in
export default function AccountButton() {
  const status = useSession((state) => state.status)
  const email = useSession((state) => state.user?.email)
  const signedIn = status === 'signedIn' && email

  return (
    <NavLink to="/account" className={s.accountButton} aria-label={signedIn ? `Account (${email})` : 'Account'}>
      {signedIn ? <span aria-hidden="true">{email[0].toUpperCase()}</span> : <UserRound size={20} aria-hidden="true" />}
    </NavLink>
  )
}
