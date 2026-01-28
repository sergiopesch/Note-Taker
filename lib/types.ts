export type SpeakerSegment = {
  speaker: string
  text: string
}

export type Transcription = {
  id: number
  date: string
  text: string
  segments?: SpeakerSegment[]
  title?: string
  summary?: string
  nextSteps?: string
}
