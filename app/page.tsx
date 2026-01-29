'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, StopCircle, Sparkles, X } from 'lucide-react'
import VoiceNotes from '@/components/ui/VoiceNotes'
import { SettingsDialog } from '@/components/ui/SettingsDialog'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import type { AIProvider, AudioSource } from '@/components/ui/SettingsDialog'
import { generateSummaryAction } from '@/app/actions'
import type { Transcription, SpeakerSegment } from '@/lib/types'
import { SpeakerSegmentDisplay } from '@/components/ui/SpeakerSegmentDisplay'
import { LiveSpeakerNamingCard } from '@/components/ui/LiveSpeakerNamingCard'
import { safeGetFromStorage, safeSetInStorage } from '@/lib/storage'
import { blobToWav } from '@/lib/wav'

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
}

const SOURCE_LABELS: Record<AudioSource, string> = {
  mic: 'Mic',
  system: 'System',
  both: 'Mic + System',
}

const STORAGE_KEYS: Record<AIProvider, string> = {
  openai: 'openai_api_key',
  claude: 'claude_api_key',
  gemini: 'gemini_api_key',
}

export default function Home() {
  const [isRecording, setIsRecording] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [liveSegments, setLiveSegments] = useState<SpeakerSegment[] | null>(null)
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState<AIProvider>('openai')
  const [audioSource, setAudioSource] = useState<AudioSource>('mic')
  const [diarization, setDiarization] = useState(false)
  const [speakerNamesLive, setSpeakerNamesLive] = useState<Record<string, string>>({})

  // Wrap-up countdown
  const [wrapCountdown, setWrapCountdown] = useState<number | null>(null)
  const wrapIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const transcriptionContainerRef = useRef<HTMLDivElement>(null)

  // Streaming transcript
  const finalizedTextRef = useRef('')
  const interimTextRef = useRef('')
  const hasSpeechAPIRef = useRef(false)
  // Some browsers expose SpeechRecognition but never produce results (permissions, service issues).
  // We only treat it as "working" after we actually receive a result.
  const speechResultReceivedRef = useRef(false)

  // Periodic AI chunk transcription (fallback when no Web Speech API)
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isProcessingChunkRef = useRef(false)
  const chunkTranscriptRef = useRef('')
  const lastChunkFullTextRef = useRef('')

  // Live diarization polling (when diarization setting is ON)
  const diarizeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isProcessingDiarizeRef = useRef(false)

  const loadSettings = useCallback(() => {
    const p = localStorage.getItem('ai_provider') as AIProvider
    if (p && PROVIDER_LABELS[p]) setProvider(p)

    const s = localStorage.getItem('audio_source') as AudioSource
    if (s && SOURCE_LABELS[s]) setAudioSource(s)

    setDiarization(localStorage.getItem('diarization') === 'on')
  }, [])

  // Load settings and transcriptions on mount
  useEffect(() => {
    loadSettings()
    const stored = safeGetFromStorage<Transcription[]>('transcriptions')
    if (stored) setTranscriptions(stored)
  }, [loadSettings])

  // Auto-scroll the transcription box
  useEffect(() => {
    if (transcriptionContainerRef.current) {
      transcriptionContainerRef.current.scrollTop =
        transcriptionContainerRef.current.scrollHeight
    }
  }, [liveTranscript, liveSegments])

  // --- Audio capture ---

  const getAudioStream = async (): Promise<MediaStream> => {
    const source =
      (localStorage.getItem('audio_source') as AudioSource) || 'mic'

    if (source === 'mic') {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamsRef.current.push(stream)
      return stream
    }

    if (source === 'system') {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true, // required by browser APIs
      })
      streamsRef.current.push(displayStream)

      const audioTracks = displayStream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error(
          'No system audio captured. Make sure to check "Share audio" in the browser dialog.'
        )
      }
      return new MediaStream(audioTracks)
    }

    // 'both' — merge mic + system audio
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamsRef.current.push(micStream)

    let displayStream: MediaStream
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      })
      streamsRef.current.push(displayStream)
    } catch {
      return micStream
    }

    const displayAudioTracks = displayStream.getAudioTracks()
    if (displayAudioTracks.length === 0) {
      return micStream
    }

    const audioContext = new AudioContext()
    audioContextRef.current = audioContext
    const destination = audioContext.createMediaStreamDestination()

    const micSource = audioContext.createMediaStreamSource(micStream)
    const systemSource = audioContext.createMediaStreamSource(
      new MediaStream(displayAudioTracks)
    )

    micSource.connect(destination)
    systemSource.connect(destination)

    return destination.stream
  }

  // --- Speech Recognition for live streaming preview ---

  const startSpeechRecognition = () => {
    try {
      const SpeechRecognitionAPI =
        window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognitionAPI) {
        hasSpeechAPIRef.current = false
        return
      }

      const recognition = new SpeechRecognitionAPI()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Mark SpeechRecognition as actually working.
        speechResultReceivedRef.current = true
        hasSpeechAPIRef.current = true

        let interim = ''

        // Process only the new results since last event.
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalizedTextRef.current += transcript + ' '
          } else {
            interim += transcript
          }
        }

        interimTextRef.current = interim
        setLiveTranscript((finalizedTextRef.current + interim).trimStart())
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // Some browsers will abort recognition on focus/click/visibility transitions.
        // If we're still recording, we want to restart immediately.
        if (
          (event.error === 'aborted' || event.error === 'no-speech') &&
          mediaRecorderRef.current?.state === 'recording'
        ) {
          setTimeout(() => {
            try {
              recognition.start()
            } catch {
              // ignore
            }
          }, 250)
          return
        }

        // If speech recognition is blocked/unsupported at runtime, fall back to AI chunk transcription.
        if (
          event.error === 'not-allowed' ||
          event.error === 'service-not-allowed' ||
          event.error === 'audio-capture'
        ) {
          hasSpeechAPIRef.current = false
          setStatus(
            `SpeechRecognition error: ${event.error}. Falling back to AI live preview...`
          )
        }

        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('SpeechRecognition error:', event.error)
        }
      }

      recognition.onend = () => {
        // If SpeechRecognition stops while we have interim text, keep it (otherwise users see only a few letters).
        if (interimTextRef.current.trim()) {
          finalizedTextRef.current += interimTextRef.current.trim() + ' '
          interimTextRef.current = ''
        }

        if (mediaRecorderRef.current?.state === 'recording') {
          // Chrome can throw if you restart immediately; a tiny delay helps.
          setTimeout(() => {
            try {
              recognition.start()
            } catch {
              // ignore
            }
          }, 250)
        }
      }

      try {
        speechResultReceivedRef.current = false
        interimTextRef.current = ''
        recognition.start()
        speechRecognitionRef.current = recognition
        // Don't set hasSpeechAPIRef=true yet — only after we receive a result.
        hasSpeechAPIRef.current = false

        // If no results arrive quickly, assume SpeechRecognition is "present but not working"
        // and let the AI fallback provide live text.
        setTimeout(() => {
          if (
            mediaRecorderRef.current?.state === 'recording' &&
            !speechResultReceivedRef.current
          ) {
            hasSpeechAPIRef.current = false
          }
        }, 2000)
      } catch (err) {
        // If start fails (permissions / unsupported), fall back to AI chunk transcription
        console.warn('SpeechRecognition failed to start:', err)
        hasSpeechAPIRef.current = false
        speechRecognitionRef.current = null
      }
    } catch {
      console.warn('SpeechRecognition is not available in this browser')
      hasSpeechAPIRef.current = false
    }
  }

  // --- Periodic AI chunk transcription (fallback for browsers without Web Speech API) ---

  const processAudioChunk = useCallback(async () => {
    // Only run as fallback when SpeechRecognition is actually producing results.
    // If it's present-but-silent, we still want the AI fallback.
    if (hasSpeechAPIRef.current && speechResultReceivedRef.current) return
    if (isProcessingChunkRef.current) return

    const allChunks = audioChunksRef.current
    if (allChunks.length === 0) return

    // Important: MediaRecorder chunks after the first often do NOT contain container headers.
    // Sending only "new" chunks can produce invalid/undecodable audio for Whisper.
    // For the fallback live preview, we re-send the full recording-so-far and diff text.
    isProcessingChunkRef.current = true

    try {
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
      const blob = new Blob(allChunks, { type: mimeType })
      if (blob.size === 0) return

      const currentProvider =
        (localStorage.getItem('ai_provider') as AIProvider) || 'openai'
      const apiKey = localStorage.getItem(STORAGE_KEYS[currentProvider])
      if (!apiKey) return

      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      formData.append('provider', currentProvider)
      formData.append('apiKey', apiKey)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()

      if (response.ok && result.text?.trim()) {
        const full = String(result.text).trim()
        const prevFull = lastChunkFullTextRef.current
        lastChunkFullTextRef.current = full

        // Best-effort diff: if the new transcription starts with the previous, append only the tail.
        // Otherwise, replace the preview.
        let next = ''
        if (prevFull && full.toLowerCase().startsWith(prevFull.toLowerCase())) {
          const tail = full.slice(prevFull.length).trim()
          next = tail
            ? (chunkTranscriptRef.current + ' ' + tail).trim()
            : chunkTranscriptRef.current
        } else {
          next = full
        }

        chunkTranscriptRef.current = next
        setLiveTranscript(next)
      } else if (!response.ok && result?.error) {
        // Surface fallback errors so we don't silently "record" with no text.
        setStatus(`Live preview error: ${result.error}`)
      }
    } catch (err) {
      console.warn('Chunk transcription error:', err)
    } finally {
      isProcessingChunkRef.current = false
    }
  }, [])

  const processLiveDiarization = useCallback(async () => {
    if (!isRecording) return
    const isDiarized = localStorage.getItem('diarization') === 'on'
    if (!isDiarized) return
    if (isProcessingDiarizeRef.current) return

    const allChunks = audioChunksRef.current
    if (allChunks.length === 0) return

    isProcessingDiarizeRef.current = true

    try {
      const currentProvider =
        (localStorage.getItem('ai_provider') as AIProvider) || 'openai'
      const apiKey = localStorage.getItem(STORAGE_KEYS[currentProvider])
      if (!apiKey) return

      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
      const webmBlob = new Blob(allChunks, { type: mimeType })
      if (webmBlob.size === 0) return

      const formData = new FormData()

      // For OpenAI diarization path, our API expects chat-audio and works best with WAV.
      if (currentProvider === 'openai') {
        const wavBlob = await blobToWav(webmBlob)
        formData.append('audio', wavBlob, 'live.wav')
      } else {
        formData.append('audio', webmBlob, 'live.webm')
      }

      formData.append('provider', currentProvider)
      formData.append('apiKey', apiKey)
      formData.append('diarization', 'on')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()

      if (response.ok) {
        if (result.text?.trim()) {
          setLiveTranscript(String(result.text))
        }
        if (Array.isArray(result.segments) && result.segments.length > 0) {
          setLiveSegments(result.segments as SpeakerSegment[])
        }
      }
    } catch (err) {
      console.warn('Live diarization error:', err)
    } finally {
      isProcessingDiarizeRef.current = false
    }
  }, [isRecording])

  // --- Cleanup ---

  const cleanup = () => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current)
      chunkIntervalRef.current = null
    }

    if (diarizeIntervalRef.current) {
      clearInterval(diarizeIntervalRef.current)
      diarizeIntervalRef.current = null
    }

    if (wrapIntervalRef.current) {
      clearInterval(wrapIntervalRef.current)
      wrapIntervalRef.current = null
    }
    setWrapCountdown(null)

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null

    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch {
        // ignore
      }
      audioContextRef.current = null
    }
  }

  // --- Recording lifecycle ---

  const cancelWrap = () => {
    if (wrapIntervalRef.current) {
      clearInterval(wrapIntervalRef.current)
      wrapIntervalRef.current = null
    }
    setWrapCountdown(null)
    setStatus('Recording — keep going...')
  }

  const startWrapCountdown = () => {
    if (!isRecording) return
    if (wrapIntervalRef.current) return

    let remaining = 10
    setWrapCountdown(remaining)
    setStatus('Wrap-up queued. You have 10 seconds to cancel…')

    wrapIntervalRef.current = setInterval(() => {
      remaining -= 1
      setWrapCountdown(remaining)

      if (remaining <= 0) {
        if (wrapIntervalRef.current) {
          clearInterval(wrapIntervalRef.current)
          wrapIntervalRef.current = null
        }
        setWrapCountdown(null)
        // Trigger stop + summary
        stopRecording()
      }
    }, 1000)
  }

  const startRecording = async () => {
    try {
      setLiveTranscript('')
      setLiveSegments(null)
      audioChunksRef.current = []
      finalizedTextRef.current = ''
      interimTextRef.current = ''
      hasSpeechAPIRef.current = false
      speechResultReceivedRef.current = false
      isProcessingChunkRef.current = false
      chunkTranscriptRef.current = ''
      lastChunkFullTextRef.current = ''
      setSpeakerNamesLive({})
      loadSettings()

      if (wrapIntervalRef.current) {
        clearInterval(wrapIntervalRef.current)
        wrapIntervalRef.current = null
      }
      setWrapCountdown(null)

      setStatus('Setting up audio...')
      const stream = await getAudioStream()

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      )
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      // Start recording with a shorter timeslice so chunks arrive sooner for the fallback path.
      recorder.start(500)
      startSpeechRecognition()

      // Start periodic AI chunk transcription (fallback when Web Speech API unavailable)
      chunkIntervalRef.current = setInterval(() => {
        processAudioChunk()
      }, 1500)

      // Kick the fallback once quickly
      setTimeout(() => {
        processAudioChunk()
      }, 800)

      // If diarization is on, poll live diarization while recording.
      if (localStorage.getItem('diarization') === 'on') {
        diarizeIntervalRef.current = setInterval(() => {
          processLiveDiarization()
        }, 4000)
        // fast first pass
        setTimeout(() => {
          processLiveDiarization()
        }, 1800)
      }

      setIsRecording(true)
      // We may not know yet if SpeechRecognition will actually produce results.
      setStatus('Recording — speak now, text appears live...')
    } catch (err) {
      console.error('Failed to start recording:', err)
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      cleanup()
    }
  }

  const stopRecording = async () => {
    setIsRecording(false)

    if (wrapIntervalRef.current) {
      clearInterval(wrapIntervalRef.current)
      wrapIntervalRef.current = null
    }
    setWrapCountdown(null)

    // Clear chunk processing interval
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current)
      chunkIntervalRef.current = null
    }

    if (diarizeIntervalRef.current) {
      clearInterval(diarizeIntervalRef.current)
      diarizeIntervalRef.current = null
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null
    }

    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanup()
      return
    }

    // Capture the live transcript before processing
    const liveText = (finalizedTextRef.current + interimTextRef.current).trim()

    const audioBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        resolve(blob)
      }
      recorder.stop()
    })

    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch {
        // ignore
      }
      audioContextRef.current = null
    }
    mediaRecorderRef.current = null

    if (audioBlob.size === 0) {
      setStatus('No audio recorded')
      return
    }

    const currentProvider =
      (localStorage.getItem('ai_provider') as AIProvider) || 'openai'
    const apiKey = localStorage.getItem(STORAGE_KEYS[currentProvider])
    const isDiarized = localStorage.getItem('diarization') === 'on'

    if (!apiKey) {
      setStatus(
        `No ${PROVIDER_LABELS[currentProvider]} API key configured. Please add it in Settings.`
      )
      return
    }

    // Keep showing the live transcript while we finalize
    if (liveText) {
      setLiveTranscript(liveText)
    }

    const diarizeLabel = isDiarized ? ' with speaker identification' : ''
    setStatus(
      `Finalizing transcription${diarizeLabel} with ${PROVIDER_LABELS[currentProvider]}...`
    )

    try {
      const formData = new FormData()

      // For OpenAI diarization via chat audio, send WAV to avoid format mismatch.
      if (currentProvider === 'openai' && isDiarized) {
        setStatus('Preparing audio for diarization...')
        const wavBlob = await blobToWav(audioBlob)
        formData.append('audio', wavBlob, 'recording.wav')
      } else {
        formData.append('audio', audioBlob, 'recording.webm')
      }

      formData.append('provider', currentProvider)
      formData.append('apiKey', apiKey)
      if (isDiarized) {
        formData.append('diarization', 'on')
      }

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Transcription failed')
      }

      const transcribedText: string = result.text
      const segments: SpeakerSegment[] | undefined = result.segments

      if (!transcribedText?.trim()) {
        // Fall back to the live transcript if AI returned nothing
        if (liveText) {
          setLiveTranscript(liveText)
          setStatus('Generating summary...')
          const summaryResult = await generateSummaryAction({
            transcriptionText: liveText,
            provider: currentProvider,
            apiKey,
          })

          const newTranscription: Transcription = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            text: liveText,
          }

          if ('title' in summaryResult) {
            newTranscription.title = summaryResult.title
            newTranscription.summary = summaryResult.summary
            newTranscription.nextSteps = summaryResult.nextSteps
          }

          const updated = [newTranscription, ...transcriptions]
          safeSetInStorage('transcriptions', updated)
          setTranscriptions(updated)
          setLiveTranscript('')
          setLiveSegments(null)
          setStatus('')
          return
        }
        setStatus('No speech detected in the recording')
        return
      }

      // Show the final AI transcription (with or without speaker segments)
      setLiveTranscript(transcribedText)
      if (segments && segments.length > 0) {
        setLiveSegments(segments)
      }

      // Build the text for summary — include speaker labels if diarized
      const summaryInput =
        segments && segments.length > 0
          ? segments.map((s) => `${s.speaker}: ${s.text}`).join('\n')
          : transcribedText

      setStatus('Generating summary...')
      const summaryResult = await generateSummaryAction({
        transcriptionText: summaryInput,
        provider: currentProvider,
        apiKey,
      })

      const newTranscription: Transcription = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        text: transcribedText,
        segments: segments && segments.length > 0 ? segments : undefined,
        speakerNames:
          segments && segments.length > 0
            ? speakerNamesLive
            : undefined,
      }

      if ('error' in summaryResult && summaryResult.error) {
        console.error('Summary error:', summaryResult.error)
      }
      if ('title' in summaryResult) {
        newTranscription.title = summaryResult.title
        newTranscription.summary = summaryResult.summary
        newTranscription.nextSteps = summaryResult.nextSteps
      }

      const updated = [newTranscription, ...transcriptions]
      safeSetInStorage('transcriptions', updated)
      setTranscriptions(updated)
      setLiveTranscript('')
      setLiveSegments(null)
      setStatus('')
    } catch (error) {
      console.error('Processing error:', error)
      setStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans flex flex-col items-center justify-center bg-background relative">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <SettingsDialog onSettingsChange={loadSettings} />
      </div>
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-1">Note Taker</h1>
          <p className="text-sm text-muted-foreground">
            {SOURCE_LABELS[audioSource]} &middot; {PROVIDER_LABELS[provider]}
            {diarization && ' \u00b7 Speakers'}
          </p>
        </div>

        <div className="flex flex-col items-center mb-10">
          {status && (
            <p className="text-sm text-muted-foreground mb-4 text-center">{status}</p>
          )}

          <div className="mb-6 flex items-center gap-3">
            {isRecording ? (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={stopRecording}
                  className="rounded-full px-7"
                >
                  <StopCircle className="w-5 h-5 mr-2" />
                  Stop
                </Button>

                <Button
                  size="lg"
                  onClick={startWrapCountdown}
                  disabled={wrapCountdown !== null}
                  className="rounded-full px-7"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  {wrapCountdown !== null ? `Wrap it (${wrapCountdown})` : 'Wrap it'}
                </Button>

                {wrapCountdown !== null && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={cancelWrap}
                    className="rounded-full px-5"
                  >
                    <X className="w-5 h-5 mr-2" />
                    Cancel
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="lg"
                onClick={startRecording}
                className="rounded-full px-8"
              >
                <Mic className="w-5 h-5 mr-2" />
                Start Recording
              </Button>
            )}
          </div>

          <div
            ref={transcriptionContainerRef}
            className="w-full border border-border rounded-lg p-4 h-48 overflow-y-auto bg-muted/50"
          >
            {liveSegments && liveSegments.length > 0 ? (
              <div className="space-y-3">
                <LiveSpeakerNamingCard
                  segments={liveSegments}
                  speakerNames={speakerNamesLive}
                  onChange={setSpeakerNamesLive}
                />
                <SpeakerSegmentDisplay
                  segments={liveSegments}
                  speakerNames={speakerNamesLive}
                />
              </div>
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {liveTranscript ? (
                  <>
                    {liveTranscript}
                    {isRecording && (
                      <span className="inline-block w-1.5 h-4 ml-0.5 bg-foreground/70 animate-pulse align-text-bottom" />
                    )}
                  </>
                ) : isRecording ? (
                  <span className="text-muted-foreground animate-pulse">
                    Listening... speak now
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Press Start to begin recording
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <VoiceNotes transcriptions={transcriptions} />
      </div>
    </div>
  )
}
