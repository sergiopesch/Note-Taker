'use client'

import React from 'react'
import type { SpeakerSegment } from '@/lib/types'

// Speaker colors with accent-inspired palette
const SPEAKER_STYLES: { label: string; border: string }[] = [
  { label: 'text-primary font-semibold', border: 'border-l-primary' },
  { label: 'text-foreground font-semibold', border: 'border-l-foreground' },
  { label: 'text-grok-accent-muted font-semibold', border: 'border-l-grok-accent-muted' },
  { label: 'text-muted-foreground font-semibold', border: 'border-l-muted-foreground' },
  { label: 'text-foreground/60 font-semibold', border: 'border-l-foreground/60' },
]

function getSpeakerStyle(speakerIndex: number) {
  return SPEAKER_STYLES[speakerIndex % SPEAKER_STYLES.length]
}

function buildSpeakerMap(segments: SpeakerSegment[]): Map<string, number> {
  const map = new Map<string, number>()
  let index = 0
  for (const seg of segments) {
    if (!map.has(seg.speaker)) {
      map.set(seg.speaker, index++)
    }
  }
  return map
}

interface SpeakerSegmentDisplayProps {
  segments: SpeakerSegment[]
  compact?: boolean
  speakerNames?: Record<string, string>
}

export function SpeakerSegmentDisplay({ segments, compact, speakerNames }: SpeakerSegmentDisplayProps) {
  const speakerMap = buildSpeakerMap(segments)

  if (segments.length === 0) {
    return null
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {segments.map((segment, i) => {
        const idx = speakerMap.get(segment.speaker) ?? 0
        const style = getSpeakerStyle(idx)

        return (
          <div
            key={i}
            className={`border-l-2 pl-3 ${style.border}`}
          >
            <span className={`text-xs uppercase tracking-wide ${style.label}`}>
              {(speakerNames?.[segment.speaker] || segment.speaker)}
            </span>
            <p className={`text-sm text-foreground ${compact ? 'mt-0.5' : 'mt-1'}`}>
              {segment.text}
            </p>
          </div>
        )
      })}
    </div>
  )
}
