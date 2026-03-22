import { useEffect, useState, type ReactNode } from 'react'
import {
  getResumeReadableUrl,
  resumeHasDownloadableFile,
  type Resume,
} from '../lib/supabase'

type ResumeFileFields = Pick<
  Resume,
  'id' | 'storage_object_path' | 'resume_file_url' | 'resume_file_name'
>

export default function ResumeFileLink({
  resume,
  className,
  children,
}: {
  resume: ResumeFileFields
  className?: string
  children?: ReactNode
}) {
  const [href, setHref] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const u = await getResumeReadableUrl(resume)
      if (!cancelled) {
        setHref(u)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resume.id, resume.storage_object_path, resume.resume_file_url])

  if (!resumeHasDownloadableFile(resume)) {
    return <span className={className}>No file</span>
  }
  if (loading || !href) {
    return (
      <span className={className} style={{ opacity: 0.75 }}>
        Preparing link…
      </span>
    )
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children ?? resume.resume_file_name ?? 'View resume'}
    </a>
  )
}
