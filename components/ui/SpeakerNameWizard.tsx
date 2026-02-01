'use client'

import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
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

export function SpeakerNameWizard({
  segments,
  initialNames,
  onSave,
  onClose,
}: {
  segments: SpeakerSegment[]
  initialNames?: Record<string, string>
  onSave: (names: Record<string, string>) => void
  onClose?: () => void
}) {
  const speakers = useMemo(() => uniqueSpeakers(segments), [segments])

  const [step, setStep] = useState(0)
  const [names, setNames] = useState<Record<string, string>>(initialNames || {})

  const currentSpeaker = speakers[step]

  if (speakers.length === 0) return null

  // If all names already exist, don't show the wizard.
  const allNamed = speakers.every((s) => (names[s] || '').trim().length > 0)
  if (allNamed) return null

  const label = currentSpeaker || ''
  const displayNumber = step + 1

  const handleNext = () => {
    if (step < speakers.length - 1) {
      setStep(step + 1)
      return
    }
    onSave(names)
  }

  const handleSkip = () => {
    // Save whatever we have and exit.
    onSave(names)
  }

  return (
    <div className="w-full border border-border rounded-xl p-4 bg-gradient-to-b from-card/60 to-background">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Diarization
          </p>
          <h3 className="text-base font-semibold mt-1">
            Who is {label}?
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Set speaker names to make the transcript readable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            Speaker {displayNumber} of {speakers.length}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <Label htmlFor="speaker-name">Name for {label}</Label>
        <Input
          id="speaker-name"
          value={names[label] || ''}
          onChange={(e) => setNames((prev) => ({ ...prev, [label]: e.target.value }))}
          placeholder={displayNumber === 1 ? 'e.g. Sergio' : 'e.g. Alex'}
          autoFocus
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handleSkip}>
          Skip
        </Button>

        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
          )}
          <Button size="sm" onClick={handleNext}>
            {step < speakers.length - 1 ? 'Next' : 'Done'}
          </Button>
        </div>
      </div>
    </div>
  )
}
