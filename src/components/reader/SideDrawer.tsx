'use client'
import type { ReactNode } from 'react'
import { IconClose } from '@/components/app/icons'
import { useI18n } from '@/lib/i18n'

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
  const { t } = useI18n()
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
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('reader.close')}>
            <IconClose />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </section>
    </>
  )
}
