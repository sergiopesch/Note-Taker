'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2, ArrowLeft } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { SpeakerSegmentDisplay } from '@/components/ui/SpeakerSegmentDisplay'
import type { Transcription } from '@/lib/types'

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

    const storedTranscriptions = localStorage.getItem('transcriptions')
    if (storedTranscriptions) {
      const transcriptions: Transcription[] = JSON.parse(storedTranscriptions)
      const found = transcriptions.find(
        (item: Transcription) => item.id === Number(id)
      )
      if (found) {
        setTranscription(found)
        setTitle(found.title || '')
        setSummary(found.summary || '')
        setNextSteps(found.nextSteps || '')
      } else {
        router.push('/')
      }
    } else {
      router.push('/')
    }
  }, [id, router])

  const saveTitle = () => {
    if (transcription) {
      const storedTranscriptions = localStorage.getItem('transcriptions')
      if (storedTranscriptions) {
        const transcriptions: Transcription[] = JSON.parse(storedTranscriptions)
        const updatedTranscriptions = transcriptions.map((item) => {
          if (item.id === transcription.id) {
            return { ...item, title: title }
          }
          return item
        })
        localStorage.setItem('transcriptions', JSON.stringify(updatedTranscriptions))
        setTranscription({ ...transcription, title: title })
      }
    }
  }

  const handleDelete = () => {
    const storedTranscriptions = localStorage.getItem('transcriptions')
    if (storedTranscriptions) {
      const transcriptions: Transcription[] = JSON.parse(storedTranscriptions)
      const updatedTranscriptions = transcriptions.filter(
        (item: Transcription) => item.id !== Number(id)
      )
      localStorage.setItem('transcriptions', JSON.stringify(updatedTranscriptions))
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
              <div className="border border-border rounded-lg p-4 bg-muted/50">
                {transcription.segments && transcription.segments.length > 0 ? (
                  <SpeakerSegmentDisplay segments={transcription.segments} />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {transcription.text}
                  </p>
                )}
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
