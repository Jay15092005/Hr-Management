import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './MeetingTranscripts.css'

interface TranscriptRow {
  id: string
  room_id: string
  participant_name: string | null
  speaker_label: string | null
  message: string
  at: string
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
        setError(error.message || 'Failed to import transcript from VideoSDK.')
      } else if (data?.error) {
        console.error('Import data error:', data)
        setError(data.error || 'Failed to import transcript from VideoSDK.')
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

      {loading && (
        <p className="mt-info">Loading transcripts...</p>
      )}
      {error && !loading && (
        <p className="mt-error">{error}</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="mt-info">
          No transcript lines found yet for this meeting. The transcript will appear here after
          realtime transcription starts saving lines.
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

