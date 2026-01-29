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
import { blobToWav, float32ToWav } from '@/lib/wav'

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
  const wrapRunIdRef = useRef(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const transcriptionContainerRef = useRef<HTMLDivElement>(null)

  // Live PCM buffer (used for OpenAI live diarization polling)
  const pcmSampleRateRef = useRef<number | null>(null)
  const pcmChunksRef = useRef<Float32Array[]>([])
  const pcmMaxSecondsRef = useRef(12)
  const pcmNodeRef = useRef<ScriptProcessorNode | null>(null)

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

  const startPcmBuffering = (stream: MediaStream) => {
    try {
      const audioContext = audioContextRef.current || new AudioContext()
      audioContextRef.current = audioContext

      // Reset buffer
      pcmSampleRateRef.current = audioContext.sampleRate
      pcmChunksRef.current = []

      const source = audioContext.createMediaStreamSource(stream)
      // ScriptProcessor is deprecated but still works in Chrome and is simplest for this use-case.
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      pcmNodeRef.current = processor

      processor.onaudioprocess = (e) => {
        if (mediaRecorderRef.current?.state !== 'recording') return

        const input = e.inputBuffer.getChannelData(0)
        // Copy out, since the underlying buffer is reused.
        pcmChunksRef.current.push(new Float32Array(input))

        // Trim to last N seconds
        const sr = pcmSampleRateRef.current || audioContext.sampleRate
        const maxSamples = Math.floor(sr * pcmMaxSecondsRef.current)
        let total = pcmChunksRef.current.reduce((acc, a) => acc + a.length, 0)
        while (total > maxSamples && pcmChunksRef.current.length > 1) {
          const removed = pcmChunksRef.current.shift()
          total -= removed ? removed.length : 0
        }
      }

      // Connect processor (some browsers require it to be connected to output)
      source.connect(processor)
      processor.connect(audioContext.destination)
    } catch (err) {
      console.warn('PCM buffering unavailable:', err)
    }
  }

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
    // Use recorder state rather than React state to avoid stale closures in intervals.
    if (mediaRecorderRef.current?.state !== 'recording') return

    const isDiarized = localStorage.getItem('diarization') === 'on'
    if (!isDiarized) return
    if (isProcessingDiarizeRef.current) return

    isProcessingDiarizeRef.current = true

    try {
      const currentProvider =
        (localStorage.getItem('ai_provider') as AIProvider) || 'openai'
      const apiKey = localStorage.getItem(STORAGE_KEYS[currentProvider])
      if (!apiKey) return

      const formData = new FormData()

      if (currentProvider === 'openai') {
        // Build a WAV from the last ~N seconds of PCM samples.
        const sr = pcmSampleRateRef.current
        if (!sr || pcmChunksRef.current.length === 0) return

        const totalLen = pcmChunksRef.current.reduce((acc, a) => acc + a.length, 0)
        const merged = new Float32Array(totalLen)
        let offset = 0
        for (const c of pcmChunksRef.current) {
          merged.set(c, offset)
          offset += c.length
        }

        const wavBlob = float32ToWav(merged, sr)
        formData.append('audio', wavBlob, 'live.wav')
      } else {
        // Claude/Gemini can accept webm directly. We send the full recording-so-far.
        const allChunks = audioChunksRef.current
        if (allChunks.length === 0) return
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
        const webmBlob = new Blob(allChunks, { type: mimeType })
        if (webmBlob.size === 0) return
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
      } else if (result?.error) {
        setStatus(`Live diarization error: ${result.error}`)
      }
    } catch (err) {
      console.warn('Live diarization error:', err)
    } finally {
      isProcessingDiarizeRef.current = false
    }
  }, [])

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

    // Stop PCM buffering
    if (pcmNodeRef.current) {
      try {
        pcmNodeRef.current.disconnect()
      } catch {
        // ignore
      }
      pcmNodeRef.current = null
    }
    pcmChunksRef.current = []
    pcmSampleRateRef.current = null

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
    // Invalidate any in-flight wrap countdown callbacks
    wrapRunIdRef.current += 1

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

    // New wrap run
    wrapRunIdRef.current += 1
    const runId = wrapRunIdRef.current

    let remaining = 10
    setWrapCountdown(remaining)
    setStatus('Wrap-up queued. You have 10 seconds to cancel…')

    wrapIntervalRef.current = setInterval(() => {
      // If another action invalidated this run (Stop/Cancel), bail.
      if (wrapRunIdRef.current !== runId) {
        if (wrapIntervalRef.current) {
          clearInterval(wrapIntervalRef.current)
          wrapIntervalRef.current = null
        }
        return
      }

      remaining -= 1
      setWrapCountdown(remaining)

      if (remaining <= 0) {
        if (wrapIntervalRef.current) {
          clearInterval(wrapIntervalRef.current)
          wrapIntervalRef.current = null
        }
        setWrapCountdown(null)
        // Trigger stop + summary (wrap-up)
        stopRecording({ generateSummary: true })
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

      // Start a small PCM ring buffer for truly-live diarization polling (especially for OpenAI, where partial WebM can be problematic).
      startPcmBuffering(stream)

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

  const stopRecording = async (
    { generateSummary }: { generateSummary: boolean } = { generateSummary: false }
  ) => {
    // Invalidate any wrap countdown so Stop can never accidentally trigger wrap-up.
    wrapRunIdRef.current += 1

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

          const newTranscription: Transcription = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            text: liveText,
          }

          if (generateSummary) {
            setStatus('Generating summary...')
            const summaryResult = await generateSummaryAction({
              transcriptionText: liveText,
              provider: currentProvider,
              apiKey,
            })

            if ('title' in summaryResult) {
              newTranscription.title = summaryResult.title
              newTranscription.summary = summaryResult.summary
              newTranscription.nextSteps = summaryResult.nextSteps
            }
          } else {
            setStatus('Saved. (No wrap-up)')
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

      if (generateSummary) {
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

        if ('error' in summaryResult && summaryResult.error) {
          console.error('Summary error:', summaryResult.error)
        }
        if ('title' in summaryResult) {
          newTranscription.title = summaryResult.title
          newTranscription.summary = summaryResult.summary
          newTranscription.nextSteps = summaryResult.nextSteps
        }
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
                  onClick={() => stopRecording({ generateSummary: false })}
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

          <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
            {/* Main transcript */}
            <div
              ref={transcriptionContainerRef}
              className="border border-border rounded-lg p-4 h-56 overflow-y-auto bg-muted/50"
            >
              {liveSegments && liveSegments.length > 0 ? (
                <SpeakerSegmentDisplay
                  segments={liveSegments}
                  speakerNames={speakerNamesLive}
                />
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

            {/* Side "Room Intel" panel */}
            <div className="border border-border rounded-lg p-4 bg-gradient-to-b from-muted/30 to-background">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Room Intel
                </p>
                <span className={`text-[10px] px-2 py-1 rounded-full border ${diarization ? 'border-foreground/30' : 'border-border'} text-muted-foreground`}>
                  {diarization ? 'Listening' : 'Diarization off'}
                </span>
              </div>

              <div className="mt-3">
                {liveSegments && liveSegments.length > 0 ? (
                  <LiveSpeakerNamingCard
                    segments={liveSegments}
                    speakerNames={speakerNamesLive}
                    onChange={setSpeakerNamesLive}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    When diarization detects speakers, I’ll ask you to name them here.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <VoiceNotes transcriptions={transcriptions} />
      </div>
    </div>
  )
}
