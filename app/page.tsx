'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Mic, StopCircle } from 'lucide-react'
import VoiceNotes from '@/components/ui/VoiceNotes'
import { SettingsDialog } from '@/components/ui/SettingsDialog'
import { generateSummaryAction, getEphemeralToken } from '@/app/actions'

// Define the Transcription type
type Transcription = {
  id: number
  date: string
  text: string
  title?: string
  summary?: string
  nextSteps?: string
}

export default function Home() {
  // State variables
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [status, setStatus] = useState('')

  // Refs for WebRTC
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const dataChannel = useRef<RTCDataChannel | null>(null)
  const audioStream = useRef<MediaStream | null>(null)
  const transcriptionContainerRef = useRef<HTMLDivElement>(null)

  // Load existing transcriptions from localStorage
  useEffect(() => {
    const storedTranscriptions = localStorage.getItem('transcriptions')
    if (storedTranscriptions) {
      setTranscriptions(JSON.parse(storedTranscriptions))
    }
  }, [])

  // Auto-scroll the transcription box when new text is added
  useEffect(() => {
    if (transcriptionContainerRef.current) {
      transcriptionContainerRef.current.scrollTop =
        transcriptionContainerRef.current.scrollHeight
    }
  }, [transcript])

  const startSession = async () => {
    try {
      setStatus('Requesting microphone...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStream.current = stream

      setStatus('Fetching token...')
      const apiKey = localStorage.getItem('openai_api_key') || undefined
      const tokenResponse = await getEphemeralToken(apiKey)

      if (tokenResponse.error || !tokenResponse.client_secret) {
        throw new Error(tokenResponse.error || 'Failed to get token')
      }

      const ephemeralKey = tokenResponse.client_secret

      setStatus('Connecting...')
      const pc = new RTCPeerConnection()
      peerConnection.current = pc

      // Set up remote audio (if the model speaks back)
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0]
      }

      // Add local audio track
      pc.addTrack(stream.getTracks()[0])

      // Set up Data Channel
      const dc = pc.createDataChannel('oai-events')
      dataChannel.current = dc

      dc.addEventListener('open', () => {
        setIsSessionActive(true)
        setStatus('Listening...')
        setTranscript('') // Clear previous transcript

        // Configure the session
        const event = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
          },
        }
        dc.send(JSON.stringify(event))
      })

      dc.addEventListener('message', (e) => {
        const realtimeEvent = JSON.parse(e.data)

        if (realtimeEvent.type === 'response.audio_transcript.delta') {
          setTranscript((prev) => prev + realtimeEvent.delta)
        }
      })

      // Start the offer/answer exchange
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const baseUrl = 'https://api.openai.com/v1/realtime'
      const model = 'gpt-4o-realtime-preview-2024-10-01'
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      })

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: await sdpResponse.text(),
      }
      await pc.setRemoteDescription(answer)

    } catch (err) {
      console.error('Failed to start session:', err)
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      stopSession()
    }
  }

  const stopSession = async () => {
    setIsSessionActive(false)
    setStatus('')

    if (dataChannel.current) {
      dataChannel.current.close()
      dataChannel.current = null
    }
    if (peerConnection.current) {
      peerConnection.current.close()
      peerConnection.current = null
    }
    if (audioStream.current) {
      audioStream.current.getTracks().forEach((track) => track.stop())
      audioStream.current = null
    }

    // If we have a transcript, generate a summary
    if (transcript.trim()) {
      await processTranscription(transcript)
    }
  }

  const processTranscription = async (finalText: string) => {
    setStatus('Generating summary...')

    const newTranscription: Transcription = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      text: finalText,
    }

    try {
      const apiKey = localStorage.getItem('openai_api_key') || undefined
      const result = await generateSummaryAction({
        transcriptionText: finalText,
        apiKey,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      newTranscription.title = result.title
      newTranscription.summary = result.summary
      newTranscription.nextSteps = result.nextSteps
    } catch (error) {
      console.error('Error generating summary:', error)
      setStatus('Error generating summary')
    }

    // Save the new transcription and update state
    const updatedTranscriptions = [newTranscription, ...transcriptions]
    localStorage.setItem('transcriptions', JSON.stringify(updatedTranscriptions))
    setTranscriptions(updatedTranscriptions)
    setStatus('')
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans flex flex-col items-center justify-center bg-gradient-to-b from-blue-100 to-white relative">
      <SettingsDialog />
      <div className="w-full max-w-3xl">
        <Card className="w-full bg-white/80 backdrop-blur-sm shadow-lg rounded-3xl overflow-hidden border-0 mb-8">
          <CardContent className="p-6 sm:p-8 h-full flex flex-col items-center">
            <h1 className="text-4xl font-bold mb-6 text-center text-gray-800">
              Note Taker
            </h1>

            {status && <p className="text-sm text-gray-500 mb-4">{status}</p>}

            <div className="mb-6">
              {isSessionActive ? (
                <Button variant="destructive" onClick={stopSession}>
                  <StopCircle className="w-6 h-6 mr-2" />
                  Stop Session
                </Button>
              ) : (
                <Button onClick={startSession}>
                  <Mic className="w-6 h-6 mr-2" />
                  Start Session
                </Button>
              )}
            </div>
            {/* Transcription Display */}
            <div
              ref={transcriptionContainerRef}
              className="w-full bg-gray-100 rounded-2xl p-4 shadow-inner h-32 overflow-y-auto"
            >
              <p className="text-gray-800 whitespace-pre-wrap">
                {transcript}
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
