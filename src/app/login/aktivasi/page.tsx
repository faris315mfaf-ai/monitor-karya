import type { Metadata } from 'next'
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '@/lib/password-policy'
import { ActivationForm } from './activation-form'

export const metadata: Metadata = {
  title: 'Aktivasi akun — Monitor Karya',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function ActivationPage() {
  return <ActivationForm minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} />
}
