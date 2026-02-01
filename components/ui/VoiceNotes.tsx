'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ArrowRight, Trash2 } from 'lucide-react'
import type { Transcription } from '@/lib/types'

interface VoiceNotesProps {
  transcriptions: Transcription[]
  onDelete?: (id: number) => void
}

export default function VoiceNotes({ transcriptions, onDelete }: VoiceNotesProps) {
  const router = useRouter()

  const handleClick = (id: number) => {
    router.push(`/transcriptions/${id}`)
  }

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    onDelete?.(id)
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
          className="group flex items-center justify-between p-4 border border-border rounded-lg cursor-pointer hover:bg-accent hover:border-primary/20 transition-all duration-200"
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
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            <button
              onClick={(e) => handleDelete(e, item.id)}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
              aria-label="Delete transcription"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      ))}
    </div>
  )
}
