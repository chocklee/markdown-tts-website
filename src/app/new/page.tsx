import Link from 'next/link'
import InputSection from '@/components/home/InputSection'
import { AppShell } from '@/components/app/AppShell'
import { IconBack } from '@/components/app/icons'

export default function NewDocumentPage() {
  return (
    <AppShell nav="library">
      <div className="view active">
        <header className="new-head">
          <Link href="/library" className="back-link" aria-label="返回文库">
            <IconBack />
            返回文库
          </Link>
          <h1>添加文档</h1>
          <p className="meta">粘贴或上传 Markdown 文件，边看边听 AI 朗读</p>
        </header>
        <InputSection />
      </div>
    </AppShell>
  )
}
