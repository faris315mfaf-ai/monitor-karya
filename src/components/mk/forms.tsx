'use client'

import * as React from 'react'
import { cx } from './core'
import { moveRovingFocus } from './keyboard'

/** Native props, labels, validation, form submission and refs remain available. */
export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input {...props} className={cx('mk-input', className)} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx('mk-textarea', className)} />
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label {...props} className={cx('mk-label', className)} />
}

export type SwitchProps = Omit<React.ComponentProps<'input'>, 'type' | 'onChange'> & {
  onCheckedChange?: (checked: boolean) => void
}

/** Checkbox native menjaga Space, label klik, reset form, name/value dan disabled. */
export function Switch({ className, onCheckedChange, ...props }: SwitchProps) {
  return <input {...props} type="checkbox" role="switch" className={cx('mk-switch', className)} onChange={(event) => onCheckedChange?.(event.currentTarget.checked)} />
}

/** Anak langsung: button role="radio" dengan aria-checked dan onClick pemilik. */
export function ChoiceGroup({ children, className, onKeyDown, ...props }: React.ComponentProps<'div'>) {
  const choices = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<React.ComponentProps<'button'>>[]
  const enabled = choices.filter((child) => !child.props.disabled && child.props['aria-disabled'] !== true && child.props['aria-disabled'] !== 'true')
  const selected = enabled.find((child) => child.props['aria-checked'] === true || child.props['aria-checked'] === 'true') ?? enabled[0]
  return (
    <div {...props} role="radiogroup" className={cx('mk-choices', className)} onKeyDown={(event) => {
      onKeyDown?.(event)
      if (!event.defaultPrevented) moveRovingFocus(event, 'button[role="radio"]:not(:disabled)', true)
    }}>
      {choices.map((child) => React.cloneElement(child, { tabIndex: child === selected ? 0 : -1 }))}
    </div>
  )
}
