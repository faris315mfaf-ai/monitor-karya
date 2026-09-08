'use client'

import { useApp } from '@/components/app-provider'
import { DivisionWeeklyDesk } from '@/components/division-weekly-desk'

/**
 * Capaian Mingguan (Kepala Divisi, TI): laporan mingguan divisi disusun dari
 * capaian per hari di papan seret-lepas — lihat DivisionWeeklyDesk (8 Sep 2026).
 */
export function WeeklyInputView() {
  const { user } = useApp()
  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Capaian Mingguan</h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
          Capaian divisi per hari, disusun menjadi laporan minggu ini · {user.name}
        </p>
      </div>
      <DivisionWeeklyDesk />
    </div>
  )
}
