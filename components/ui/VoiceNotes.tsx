'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ArrowRight } from 'lucide-react'

type Transcription = {
  id: number
  date: string
  text: string
  title?: string
  summary?: string
  nextSteps?: string
}

interface VoiceNotesProps {
  transcriptions: Transcription[]
}

export default function VoiceNotes({ transcriptions }: VoiceNotesProps) {
  const router = useRouter()

  const handleClick = (id: number) => {
    router.push(`/transcriptions/${id}`)
  }

  if (transcriptions.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No transcriptions yet.
      </p>
    )
  }

  return (
    <div className="w-full space-y-3">
      {transcriptions.map((item) => (
        <div
          key={item.id}
          className="group flex items-center justify-between p-4 border border-border rounded-lg cursor-pointer hover:bg-accent transition-colors"
          onClick={() => handleClick(item.id)}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">
              {item.title || 'Untitled'}
            </p>
            <p className="text-sm text-muted-foreground truncate mt-1">
              {item.summary
                ? item.summary.length > 100
                  ? item.summary.substring(0, 100) + '...'
                  : item.summary
                : item.text.length > 100
                ? item.text.substring(0, 100) + '...'
                : item.text}
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
              <Calendar className="w-3 h-3" />
              {item.date}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors ml-4 flex-shrink-0" />
        </div>
      ))}
    </div>
  )
}
