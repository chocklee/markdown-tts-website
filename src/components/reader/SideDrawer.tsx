'use client'
import type { ReactNode } from 'react'
import { IconClose } from '@/components/app/icons'

export function SideDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <>
      <div className={`backdrop ${open ? 'show' : ''}`} onClick={onClose} aria-hidden={!open} />
      <section
        className={`drawer ${open ? 'open' : ''}`}
        aria-label={title}
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        hidden={!open}
      >
        <div className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </section>
    </>
  )
}
