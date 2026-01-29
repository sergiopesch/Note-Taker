'use client'

import React, { useMemo } from 'react'
import { SpeakerNameWizard } from '@/components/ui/SpeakerNameWizard'
import type { SpeakerSegment } from '@/lib/types'

function uniqueSpeakers(segments: SpeakerSegment[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of segments) {
    if (!seen.has(s.speaker)) {
      seen.add(s.speaker)
      out.push(s.speaker)
    }
  }
  return out
}

export function LiveSpeakerNamingCard({
  segments,
  speakerNames,
  onChange,
}: {
  segments: SpeakerSegment[]
  speakerNames: Record<string, string>
  onChange: (names: Record<string, string>) => void
}) {
  const speakers = useMemo(() => uniqueSpeakers(segments), [segments])
  const key = speakers.join('|') // when a new speaker appears, wizard resets to the new set

  return (
    <div className="w-full">
      <SpeakerNameWizard
        key={key}
        segments={segments}
        initialNames={speakerNames}
        onSave={onChange}
      />
    </div>
  )
}
