'use client'

import * as React from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Button } from './core'

/** Dialog destruktif memakai primitif fokus Radix dan tampilan MK. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, onConfirm, onCancel }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: React.ReactNode
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="mk-scrim" />
        <AlertDialog.Content className="mk-confirm">
          <AlertDialog.Title className="mk-confirm__title">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild><div className="mk-confirm__description">{description}</div></AlertDialog.Description>
          <div className="mk-confirm__actions">
            <AlertDialog.Cancel asChild><Button onClick={onCancel}>Batal</Button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
