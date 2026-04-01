import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import './MeetingTranscripts.css'

/** Edge Function errors return JSON { error, details?, status? }; supabase-js only surfaces generic message unless we read the body. */
async function readEdgeFunctionErrorMessage(error: unknown): Promise<{
  message: string
  status?: number
}> {
  if (error instanceof FunctionsHttpError && error.context) {
    const res = error.context
    const status = res.status
    try {
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        const j = (await res.clone().json()) as {
          error?: string
          details?: string
          status?: number
        }
        const base = typeof j.error === 'string' ? j.error : null
        if (base) {
          const details = typeof j.details === 'string' ? j.details : ''
          return {
            message: details ? `${base} (${details})` : base,
            status,
          }
        }
      }
    } catch {
      /* ignore parse errors */
    }
    return { message: error.message, status }
  }
  if (error instanceof Error) return { message: error.message }
  return { message: 'Request failed' }
}

function friendlyRecordingError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('videosdk credentials not configured')) {
    return 'VideoSDK secrets missing on Supabase Edge Functions. Set VIDEOSDK_API_KEY and VIDEOSDK_SECRET, then deploy fetch-videosdk-recordings.'
  }
  if (m.includes('failed to list recordings') || m.includes('failed to fetch recording')) {
    return `VideoSDK API error: ${message}. Confirm the room had meeting recording enabled and processing finished.`
  }
  return message
}

function friendlyImportError(message: string, status?: number): string {
  const m = message.toLowerCase()
  if (
    m.includes('no post transcription') ||
    status === 404 ||
    m.includes('no vtt transcript url')
  ) {
    return 'No post-meeting transcription in VideoSDK for this room yet. Enable recording + post-transcription on VideoSDK, wait until processing finishes, then try again.'
  }
  if (m.includes('videosdk credentials not configured')) {
    return 'VideoSDK is not configured for Edge Functions. In Supabase Dashboard → Project Settings → Edge Functions secrets, set VIDEOSDK_API_KEY and VIDEOSDK_SECRET (same as local .env), then redeploy import-meeting-transcript.'
  }
  if (m.includes('failed to fetch post transcription metadata')) {
    return `VideoSDK rejected the transcription request (${message}). Check API keys and that this room had recording/transcription enabled.`
  }
  if (m.includes('failed to insert transcript')) {
    return `Could not save lines to the database: ${message}`
  }
  return message
}

interface TranscriptRow {
  id: string
  room_id: string
  participant_name: string | null
  speaker_label: string | null
  message: string
  at: string
}

/** VideoSDK GET /v2/recordings list item (subset we use in UI) */
interface VideosdkRecording {
  id?: string
  roomId?: string
  sessionId?: string
  createdAt?: string
  updatedAt?: string
  file?: {
    fileUrl?: string
    type?: string
    size?: number
    meta?: { duration?: number; resolution?: { width?: number; height?: number } }
  }
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function MeetingTranscripts() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const [rows, setRows] = useState<TranscriptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [recordings, setRecordings] = useState<VideosdkRecording[]>([])
  const [recordingsPageInfo, setRecordingsPageInfo] = useState<unknown>(null)
  const [recordingsLoading, setRecordingsLoading] = useState(false)
  const [recordingsError, setRecordingsError] = useState<string | null>(null)
  const [recordingDetailLoading, setRecordingDetailLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!roomId) {
      setError('Missing room id.')
      setLoading(false)
      return
    }
    load()
  }, [roomId])

  async function load() {
    if (!roomId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('meeting_transcripts')
        .select('id, room_id, participant_name, speaker_label, message, at')
        .eq('room_id', roomId)
        .order('at', { ascending: true })

      if (error) throw error
      setRows((data ?? []) as TranscriptRow[])
    } catch (e: any) {
      setError(e.message || 'Failed to load transcripts')
    } finally {
      setLoading(false)
    }
  }

  const firstAt = useMemo(() => (rows[0]?.at ? rows[0].at : null), [rows])

  const exportText = useMemo(() => {
    if (!rows.length) return ''
    return rows
      .map((r) => {
        const speaker = r.speaker_label || r.participant_name || 'Participant'
        return `${speaker} :- ${r.message}`
      })
      .join('\n')
  }, [rows])

  const handleCopy = async () => {
    if (!exportText) return
    try {
      await navigator.clipboard.writeText(exportText)
      // optional: toast, but keep UI simple
    } catch (e) {
      console.error('Copy failed', e)
    }
  }

  const handleImportFromVideoSDK = async () => {
    if (!roomId) return
    setImporting(true)
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('import-meeting-transcript', {
        body: { roomId },
      })
      if (error) {
        console.error('Import error:', error)
        const { message: raw, status } = await readEdgeFunctionErrorMessage(error)
        setError(friendlyImportError(raw, status))
      } else if (data?.error) {
        console.error('Import data error:', data)
        setError(
          data.error === 'No post transcription found for this room'
            ? 'No transcription found for this meeting in VideoSDK. It may not have been recorded or is still processing.'
            : data.error || 'Failed to import transcript from VideoSDK.'
        )
      } else {
        await load()
      }
    } catch (e) {
      console.error('Import exception:', e)
      setError(e instanceof Error ? e.message : 'Failed to import transcript from VideoSDK.')
    } finally {
      setImporting(false)
    }
  }

  const loadRecordings = async () => {
    if (!roomId) return
    setRecordingsLoading(true)
    setRecordingsError(null)
    try {
      const { data, error } = await supabase.functions.invoke('fetch-videosdk-recordings', {
        body: { roomId, page: 1, perPage: 20 },
      })
      if (error) {
        const { message: raw } = await readEdgeFunctionErrorMessage(error)
        setRecordingsError(friendlyRecordingError(raw))
        setRecordings([])
        setRecordingsPageInfo(null)
        return
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        setRecordingsError(friendlyRecordingError(String((data as { error: string }).error)))
        setRecordings([])
        return
      }
      const list = data as {
        success?: boolean
        recordings?: VideosdkRecording[]
        pageInfo?: unknown
      }
      setRecordings(Array.isArray(list.recordings) ? list.recordings : [])
      setRecordingsPageInfo(list.pageInfo ?? null)
    } catch (e) {
      setRecordingsError(e instanceof Error ? e.message : 'Failed to load recordings')
      setRecordings([])
    } finally {
      setRecordingsLoading(false)
    }
  }

  const refreshRecordingById = async (recordingId: string) => {
    setRecordingDetailLoading(recordingId)
    setRecordingsError(null)
    try {
      const { data, error } = await supabase.functions.invoke('fetch-videosdk-recordings', {
        body: { recordingId },
      })
      if (error) {
        const { message: raw } = await readEdgeFunctionErrorMessage(error)
        setRecordingsError(friendlyRecordingError(raw))
        return
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        setRecordingsError(friendlyRecordingError(String((data as { error: string }).error)))
        return
      }
      const payload = data as { recording?: VideosdkRecording }
      const rec = payload.recording
      if (rec && typeof rec === 'object') {
        setRecordings((prev) => {
          const idx = prev.findIndex((r) => r.id === recordingId)
          if (idx === -1) return [...prev, rec]
          const next = [...prev]
          next[idx] = { ...next[idx], ...rec }
          return next
        })
      }
    } catch (e) {
      setRecordingsError(e instanceof Error ? e.message : 'Failed to refresh recording')
    } finally {
      setRecordingDetailLoading(null)
    }
  }

  return (
    <div className="mt-page">
      <button
        className="mt-back"
        onClick={() => navigate('/', { state: { section: 'meetings' } })}
      >
        &larr; Back to Meeting Details
      </button>

      <header className="mt-header">
        <div>
          <h1 className="mt-title">Meeting Transcript</h1>
          <p className="mt-subtitle">
            Room ID: <span className="mt-mono">{roomId}</span>
          </p>
          {firstAt && (
            <p className="mt-subinfo">Date: {fmtDate(firstAt)}</p>
          )}
        </div>
        <div className="mt-header-actions">
          <button
            className="mt-btn"
            type="button"
            onClick={load}
          >
            Refresh
          </button>
          <button
            className="mt-btn"
            type="button"
            onClick={handleCopy}
            disabled={!exportText}
          >
            Copy as Text
          </button>
          <button
            className="mt-btn"
            type="button"
            onClick={handleImportFromVideoSDK}
            disabled={importing || !roomId}
          >
            {importing ? 'Importing…' : 'Import from VideoSDK'}
          </button>
        </div>
      </header>

      <section className="mt-recordings-card" aria-labelledby="mt-recordings-heading">
        <div className="mt-recordings-header">
          <h2 id="mt-recordings-heading" className="mt-recordings-title">
            Cloud recordings
          </h2>
          <p className="mt-recordings-hint">
            Video files from VideoSDK{' '}
            <a
              href="https://docs.videosdk.live/api-reference/realtime-communication/fetch-recordings"
              target="_blank"
              rel="noreferrer"
            >
              meeting recordings API
            </a>
            . Requires recording to have been started during the meeting.
          </p>
          <button
            type="button"
            className="mt-btn mt-btn-primary"
            onClick={loadRecordings}
            disabled={recordingsLoading || !roomId}
          >
            {recordingsLoading ? 'Loading recordings…' : 'Load recordings'}
          </button>
        </div>
        {recordingsError && <p className="mt-error mt-recordings-error">{recordingsError}</p>}
        {!recordingsLoading && !recordingsError && recordings.length === 0 && (
          <p className="mt-info mt-recordings-empty">
            No recordings loaded yet. Click &quot;Load recordings&quot; to query VideoSDK for this room.
          </p>
        )}
        {recordings.length > 0 && (
          <ul className="mt-recordings-list">
            {recordings.map((rec, index) => {
              const url = rec.file?.fileUrl
              const dur = rec.file?.meta?.duration
              const rid = rec.id ?? '—'
              const busy = rec.id ? recordingDetailLoading === rec.id : false
              return (
                <li key={rec.id ?? `recording-${index}`} className="mt-recording-item">
                  <div className="mt-recording-meta">
                    <span className="mt-mono">Recording ID: {rid}</span>
                    {rec.sessionId && (
                      <span className="mt-recording-sub">Session: {rec.sessionId}</span>
                    )}
                    <span className="mt-recording-sub">
                      {rec.createdAt ? fmtDate(rec.createdAt) : '—'}
                      {typeof dur === 'number' ? ` · ${Math.round(dur)}s` : ''}
                    </span>
                  </div>
                  {url ? (
                    <div className="mt-recording-player-wrap">
                      <video className="mt-recording-video" controls src={url} preload="metadata">
                        <track kind="captions" />
                      </video>
                      <div className="mt-recording-actions">
                        <a className="mt-link" href={url} target="_blank" rel="noreferrer">
                          Open in new tab
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-info">No playable file URL yet for this entry.</p>
                  )}
                  {rec.id && (
                    <button
                      type="button"
                      className="mt-btn mt-btn-small"
                      disabled={busy}
                      onClick={() => refreshRecordingById(rec.id!)}
                    >
                      {busy ? 'Refreshing…' : 'Refresh from VideoSDK'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {recordingsPageInfo != null &&
          typeof recordingsPageInfo === 'object' &&
          recordingsPageInfo !== null &&
          'total' in recordingsPageInfo && (
            <p className="mt-recordings-pageinfo">
              VideoSDK reports {(recordingsPageInfo as { total?: number }).total ?? 0} recording(s) for
              this query.
            </p>
          )}
      </section>

      {loading && (
        <p className="mt-info">Loading transcripts...</p>
      )}
      {error && !loading && (
        <p className="mt-error">{error}</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="mt-info">
          No transcript is stored for this meeting yet. Use "Import from VideoSDK" after the recording
          and transcription are completed to pull the transcript here.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mt-table-wrap">
          <table className="mt-table">
            <thead>
              <tr>
                <th className="mt-th mt-th-num">#</th>
                <th className="mt-th">Time</th>
                <th className="mt-th">Speaker</th>
                <th className="mt-th">Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const speaker = r.speaker_label || r.participant_name || 'Participant'
                return (
                  <tr key={r.id} className="mt-tr">
                    <td className="mt-td mt-td-num">{idx + 1}</td>
                    <td className="mt-td mt-td-time">{fmtTime(r.at)}</td>
                    <td className="mt-td mt-td-speaker">{speaker}</td>
                    <td className="mt-td mt-td-msg">{r.message}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

