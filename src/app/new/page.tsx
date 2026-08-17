import Link from 'next/link'
import InputSection from '@/components/home/InputSection'
import { AppShell } from '@/components/app/AppShell'
import { IconBack } from '@/components/app/icons'
import { serverT } from '@/lib/i18n/server'

export default async function NewDocumentPage() {
  return (
    <AppShell nav="library">
      <div className="view active">
        <header className="new-head">
          <Link href="/library" className="back-link" aria-label={await serverT('newDoc.back')}>
            <IconBack />
            {await serverT('newDoc.back')}
          </Link>
          <h1>{await serverT('newDoc.title')}</h1>
          <p className="meta">{await serverT('newDoc.sub')}</p>
        </header>
        <InputSection />
      </div>
    </AppShell>
  )
}
