'use client'

import * as React from 'react'

/** Satu tab stop; panah/Home/End memindahkan fokus tanpa menjalankan aksi baris. */
export function moveRovingFocus(event: React.KeyboardEvent<HTMLElement>, selector = 'button:not(:disabled)', activate = false) {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(selector))
    .filter((item) => item.getAttribute?.('aria-disabled') !== 'true')
  if (!items.length) return
  let current = items.indexOf(event.target as HTMLElement)
  if (current < 0) current = items.findIndex((item) => item.contains(event.target as Node))
  if (current < 0) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
  items[next].focus({ preventScroll: true })
  items[next].scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  if (activate) items[next].click()
}

export function useRovingFocus(count: number, initial = 0) {
  const [focused, setFocused] = React.useState(initial)
  const index = Math.max(0, Math.min(focused, count - 1))
  return {
    onKeyDown: moveRovingFocus,
    item: (i: number) => ({ tabIndex: i === index ? 0 : -1, onFocus: () => setFocused(i) }),
  }
}
