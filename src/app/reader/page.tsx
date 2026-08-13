import { ReaderClient } from '@/components/reader/ReaderClient'

export const dynamic = 'force-dynamic'

export default async function ReaderPage({
  searchParams,
}: {
  searchParams: Promise<{ docId?: string }>
}) {
  const { docId } = await searchParams
  return <ReaderClient docId={docId ?? null} />
}
