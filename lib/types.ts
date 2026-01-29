export type SpeakerSegment = {
  speaker: string
  text: string
}

export type Transcription = {
  id: number
  date: string
  text: string
  segments?: SpeakerSegment[]
  /** Optional mapping from diarization label (e.g. "Speaker 1") to a human name */
  speakerNames?: Record<string, string>
  title?: string
  summary?: string
  nextSteps?: string
}
