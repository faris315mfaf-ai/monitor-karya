'use client'

import { useApp } from '@/components/app-provider'
import { PageHeader } from '@/components/mk'
import { DivisionWeeklyDesk } from '@/components/division-weekly-desk'

/**
 * Capaian Mingguan (Kepala Divisi, TI): laporan mingguan divisi disusun dari
 * capaian per hari di papan seret-lepas — lihat DivisionWeeklyDesk (8 Sep 2026).
 * Kalimat jawaban ("n dari m divisi sudah menyerahkan…") dibuka oleh meja itu sendiri.
 */
export function WeeklyInputView() {
  const { user } = useApp()
  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader context={`Capaian divisi per hari, disusun menjadi laporan minggu ini · ${user.name}`} title="Capaian mingguan" />
      <DivisionWeeklyDesk />
    </div>
  )
}
