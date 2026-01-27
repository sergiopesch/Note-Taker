'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Mic, StopCircle } from 'lucide-react'
import VoiceNotes from '@/components/ui/VoiceNotes'
import { SettingsDialog } from '@/components/ui/SettingsDialog'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import type { AIProvider, AudioSource } from '@/components/ui/SettingsDialog'
import { generateSummaryAction } from '@/app/actions'

type Transcription = {
  id: number
  date: string
  text: string
  title?: string
  summary?: string
  nextSteps?: string
}

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
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState<AIProvider>('openai')
  const [audioSource, setAudioSource] = useState<AudioSource>('mic')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const transcriptionContainerRef = useRef<HTMLDivElement>(null)

  const loadSettings = useCallback(() => {
    const p = localStorage.getItem('ai_provider') as AIProvider
    if (p && PROVIDER_LABELS[p]) setProvider(p)

    const s = localStorage.getItem('audio_source') as AudioSource
    if (s && SOURCE_LABELS[s]) setAudioSource(s)
  }, [])

  // Load settings and transcriptions on mount
  useEffect(() => {
    loadSettings()
    const stored = localStorage.getItem('transcriptions')
    if (stored) {
      try {
        setTranscriptions(JSON.parse(stored))
      } catch {
        // ignore corrupt data
      }
    }
  }, [loadSettings])

  // Auto-scroll the transcription box
  useEffect(() => {
    if (transcriptionContainerRef.current) {
      transcriptionContainerRef.current.scrollTop =
        transcriptionContainerRef.current.scrollHeight
    }
  }, [liveTranscript])

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
      // We keep the video track alive (some browsers stop audio if video is stopped)
      // but we only use audio tracks for recording
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
      // User cancelled screen share — fall back to mic only
      return micStream
    }

    const displayAudioTracks = displayStream.getAudioTracks()
    if (displayAudioTracks.length === 0) {
      // No system audio available, fall back to mic only
      return micStream
    }

    // Merge the two audio streams via AudioContext
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

  // --- Speech Recognition for live preview ---

  const startSpeechRecognition = () => {
    try {
      const SpeechRecognitionAPI =
        window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognitionAPI) return

      const recognition = new SpeechRecognitionAPI()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let text = ''
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript
          if (event.results[i].isFinal) text += ' '
        }
        setLiveTranscript(text)
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // 'no-speech' and 'aborted' are expected during normal usage
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('SpeechRecognition error:', event.error)
        }
      }

      recognition.onend = () => {
        // Restart if still recording
        if (mediaRecorderRef.current?.state === 'recording') {
          try {
            recognition.start()
          } catch {
            // ignore — may already be started
          }
        }
      }

      recognition.start()
      speechRecognitionRef.current = recognition
    } catch {
      console.warn('SpeechRecognition is not available in this browser')
    }
  }

  // --- Cleanup ---

  const cleanup = () => {
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

  const startRecording = async () => {
    try {
      setLiveTranscript('')
      audioChunksRef.current = []
      loadSettings() // re-read in case user changed settings

      setStatus('Setting up audio...')
      const stream = await getAudioStream()

      // Choose a supported mime type
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

      recorder.start(1000) // collect chunks every second

      // Start browser SpeechRecognition for live preview
      startSpeechRecognition()

      setIsRecording(true)
      setStatus('Recording...')
    } catch (err) {
      console.error('Failed to start recording:', err)
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      cleanup()
    }
  }

  const stopRecording = async () => {
    setIsRecording(false)

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null
    }

    // Stop and collect MediaRecorder data
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanup()
      return
    }

    const audioBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        resolve(blob)
      }
      recorder.stop()
    })

    // Cleanup all streams
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

    // Re-read settings
    const currentProvider =
      (localStorage.getItem('ai_provider') as AIProvider) || 'openai'
    const apiKey = localStorage.getItem(STORAGE_KEYS[currentProvider])

    if (!apiKey) {
      setStatus(
        `No ${PROVIDER_LABELS[currentProvider]} API key configured. Please add it in Settings.`
      )
      return
    }

    // --- Transcribe ---
    setStatus(`Transcribing with ${PROVIDER_LABELS[currentProvider]}...`)

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('provider', currentProvider)
      formData.append('apiKey', apiKey)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Transcription failed')
      }

      const transcribedText: string = result.text
      if (!transcribedText?.trim()) {
        setStatus('No speech detected in the recording')
        return
      }

      // --- Summarize ---
      setStatus('Generating summary...')
      const summaryResult = await generateSummaryAction({
        transcriptionText: transcribedText,
        provider: currentProvider,
        apiKey,
      })

      const newTranscription: Transcription = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        text: transcribedText,
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
      localStorage.setItem('transcriptions', JSON.stringify(updated))
      setTranscriptions(updated)
      setLiveTranscript('')
      setStatus('')
    } catch (error) {
      console.error('Processing error:', error)
      setStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans flex flex-col items-center justify-center bg-gradient-to-b from-blue-100 to-white dark:from-gray-950 dark:to-gray-900 relative theme-transition">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <SettingsDialog onSettingsChange={loadSettings} />
      </div>
      <div className="w-full max-w-3xl">
        <Card className="w-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg rounded-3xl overflow-hidden border-0 dark:border-gray-700 mb-8 theme-transition">
          <CardContent className="p-6 sm:p-8 h-full flex flex-col items-center">
            <h1 className="text-4xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">
              Note Taker
            </h1>

            {status && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{status}</p>}

            <div className="mb-2 text-xs text-gray-400 dark:text-gray-500">
              {SOURCE_LABELS[audioSource]} &middot;{' '}
              {PROVIDER_LABELS[provider]}
            </div>

            <div className="mb-6">
              {isRecording ? (
                <Button variant="destructive" onClick={stopRecording}>
                  <StopCircle className="w-6 h-6 mr-2" />
                  Stop Recording
                </Button>
              ) : (
                <Button onClick={startRecording}>
                  <Mic className="w-6 h-6 mr-2" />
                  Start Recording
                </Button>
              )}
            </div>

            {/* Transcription Display */}
            <div
              ref={transcriptionContainerRef}
              className="w-full bg-gray-100 dark:bg-gray-700/50 rounded-2xl p-4 shadow-inner h-32 overflow-y-auto theme-transition"
            >
              <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {liveTranscript ||
                  (isRecording
                    ? 'Listening...'
                    : 'Press Start to begin recording')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Voice Notes List */}
        <VoiceNotes transcriptions={transcriptions} />
      </div>
    </div>
  )
}
