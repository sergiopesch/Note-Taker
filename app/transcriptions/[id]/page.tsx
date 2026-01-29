'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2, ArrowLeft } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { SpeakerSegmentDisplay } from '@/components/ui/SpeakerSegmentDisplay'
import { SpeakerNameWizard } from '@/components/ui/SpeakerNameWizard'
import type { Transcription } from '@/lib/types'
import { safeGetFromStorage, safeSetInStorage } from '@/lib/storage'

export default function TranscriptionDetail() {
  const [transcription, setTranscription] = useState<Transcription | null>(null)
  const [title, setTitle] = useState<string>('')
  const [summary, setSummary] = useState<string>('')
  const [nextSteps, setNextSteps] = useState<string>('')
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  useEffect(() => {
    if (!id) {
      router.push('/')
      return
    }

    const transcriptions = safeGetFromStorage<Transcription[]>('transcriptions')
    if (!transcriptions) {
      router.push('/')
      return
    }

    const found = transcriptions.find((item) => item.id === Number(id))
    if (!found) {
      router.push('/')
      return
    }

    setTranscription(found)
    setTitle(found.title || '')
    setSummary(found.summary || '')
    setNextSteps(found.nextSteps || '')
  }, [id, router])

  const persistUpdate = (patch: Partial<Transcription>) => {
    if (!transcription) return

    const transcriptions = safeGetFromStorage<Transcription[]>('transcriptions')
    if (!transcriptions) return

    const updatedTranscriptions = transcriptions.map((item) => {
      if (item.id === transcription.id) {
        return { ...item, ...patch }
      }
      return item
    })

    safeSetInStorage('transcriptions', updatedTranscriptions)
    setTranscription({ ...transcription, ...patch })
  }

  const saveTitle = () => {
    if (!transcription) return
    persistUpdate({ title })
  }

  const handleDelete = () => {
    const transcriptions = safeGetFromStorage<Transcription[]>('transcriptions')
    if (transcriptions) {
      const updated = transcriptions.filter((item) => item.id !== Number(id))
      safeSetInStorage('transcriptions', updated)
    }
    router.push('/')
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans flex items-start justify-center bg-background relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-2xl mt-12">
        {transcription ? (
          <div className="space-y-8">
            {/* Back button */}
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            {/* Title */}
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                className="w-full text-3xl font-bold bg-transparent border-0 border-b border-border focus:outline-none focus:border-foreground pb-2 placeholder:text-muted-foreground"
                placeholder="Untitled"
              />
              <p className="text-sm text-muted-foreground mt-2">
                {transcription.date}
              </p>
            </div>

            {/* Transcription */}
            <section>
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                Transcription
                {transcription.segments && transcription.segments.length > 0 && (
                  <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70">
                    ({new Set(transcription.segments.map(s => s.speaker)).size} speakers)
                  </span>
                )}
              </h2>
              <div className="space-y-3">
                {transcription.segments && transcription.segments.length > 0 && (
                  <SpeakerNameWizard
                    segments={transcription.segments}
                    initialNames={transcription.speakerNames}
                    onSave={(speakerNames) => persistUpdate({ speakerNames })}
                  />
                )}

                <div className="border border-border rounded-lg p-4 bg-muted/50">
                  {transcription.segments && transcription.segments.length > 0 ? (
                    <SpeakerSegmentDisplay
                      segments={transcription.segments}
                      speakerNames={transcription.speakerNames}
                    />
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {transcription.text}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Summary */}
            {summary ? (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                  Summary
                </h2>
                <div className="border border-border rounded-lg p-4 bg-muted/50">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {summary}
                  </p>
                </div>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">
                Summary is unavailable.
              </p>
            )}

            {/* Next Steps */}
            {nextSteps ? (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                  Next Steps
                </h2>
                <div className="border border-border rounded-lg p-4 bg-muted/50">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {nextSteps}
                  </p>
                </div>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">
                Next steps are unavailable.
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Loading...</p>
        )}
      </div>
    </div>
  )
}
