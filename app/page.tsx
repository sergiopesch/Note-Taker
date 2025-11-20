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
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [status, setStatus] = useState('')

  // Refs for WebRTC
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const dataChannel = useRef<RTCDataChannel | null>(null)
  const audioStream = useRef<MediaStream | null>(null)
  const transcriptionContainerRef = useRef<HTMLDivElement>(null)
  const currentTranscriptRef = useRef('')

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
  }, [transcript, currentTranscript])

  const startSession = async () => {
    try {
      // Clear previous transcript when starting a new session
      setTranscript('')
      setCurrentTranscript('')
      currentTranscriptRef.current = ''
      setStatus('Requesting microphone...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStream.current = stream

      setStatus('Fetching token...')
      const rawApiKey = localStorage.getItem('openai_api_key')
      const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : null
      
      if (!apiKey || apiKey === '') {
        alert('Whoops! 🙊 It looks like you forgot your OpenAI API key. Even AI needs a little magic to work! Please add it in settings to start.')
        throw new Error('Please configure your OpenAI API key in Settings first')
      }

      if (!apiKey.startsWith('sk-')) {
        throw new Error('Invalid API key format. OpenAI API keys should start with "sk-"')
      }

      const tokenResponse = await getEphemeralToken(apiKey)

      if (tokenResponse.error || !tokenResponse.client_secret) {
        const errorMsg = tokenResponse.error || 'Failed to get ephemeral token. Please check your API key.'
        console.error('Ephemeral token error:', tokenResponse)
        throw new Error(errorMsg)
      }

      const ephemeralKey = tokenResponse.client_secret
      
      if (!ephemeralKey || typeof ephemeralKey !== 'string' || ephemeralKey.trim() === '') {
        throw new Error('Received empty or invalid ephemeral token. Please try again.')
      }

      setStatus('Connecting...')
      const pc = new RTCPeerConnection()
      peerConnection.current = pc

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          // ICE candidates are handled automatically by the SDP exchange
          // No need to send them separately for OpenAI Realtime API
        }
      }

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.error('Connection state:', pc.connectionState)
          setStatus(`Connection ${pc.connectionState}`)
        }
      }

      // Add local audio track
      pc.addTrack(stream.getTracks()[0])

      // Set up Data Channel
      const dc = pc.createDataChannel('oai-events')
      dataChannel.current = dc

      let hasActiveResponse = false
      let preferInputTranscription = false

      const appendLiveText = (delta: string) => {
        if (!delta) return
        setCurrentTranscript((prev) => {
          const updated = prev + delta
          currentTranscriptRef.current = updated
          return updated
        })
      }

      const commitTranscript = (text?: string) => {
        const addition = (text ?? currentTranscriptRef.current).trim()
        setCurrentTranscript('')
        currentTranscriptRef.current = ''
        if (!addition) {
          return
        }
        setTranscript((prev) => {
          const prevText = prev || ''
          return prevText ? `${prevText} ${addition}` : addition
        })
      }

      const createTranscriptionResponse = () => {
        if (dc.readyState !== 'open' || hasActiveResponse) return
        hasActiveResponse = true
        const responseCreate = {
          type: 'response.create',
          response: {
            modalities: ['text'],
            instructions:
              'Transcribe everything the user says verbatim. Do not add commentary or acknowledgements. Output only the words you hear.',
          },
        }
        dc.send(JSON.stringify(responseCreate))
      }

      dc.addEventListener('open', () => {
        setIsSessionActive(true)
        setStatus('Listening...')
        setTranscript('')
        setCurrentTranscript('')
        currentTranscriptRef.current = ''

        // Configure the session
        const sessionUpdate = {
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions: 'You are a silent note-taker. You listen to the user and allow them to speak. You do not interrupt or respond.',
            input_audio_transcription: {
              model: 'whisper-1',
            },
          },
        }
        dc.send(JSON.stringify(sessionUpdate))
        createTranscriptionResponse()
      })

      dc.addEventListener('message', (e) => {
        try {
          if (!e || !e.data) return

          const realtimeEvent = JSON.parse(e.data)
          if (!realtimeEvent || typeof realtimeEvent !== 'object') return

          switch (realtimeEvent.type) {
            case 'input_audio_buffer.transcript.delta': {
              preferInputTranscription = true
              const delta = typeof realtimeEvent.delta === 'string' ? realtimeEvent.delta : ''
              appendLiveText(delta)
              break
            }
            case 'conversation.item.input_audio_transcription.completed': {
              preferInputTranscription = true
              const finalTranscript =
                typeof realtimeEvent.transcript === 'string' ? realtimeEvent.transcript : ''
              if (finalTranscript) {
                commitTranscript(finalTranscript)
              }
              hasActiveResponse = false
              setTimeout(createTranscriptionResponse, 50)
              break
            }
            case 'response.output_text.delta': {
              if (preferInputTranscription) break
              const delta =
                typeof realtimeEvent.delta === 'string'
                  ? realtimeEvent.delta
                  : typeof realtimeEvent.text === 'string'
                    ? realtimeEvent.text
                    : ''
              appendLiveText(delta)
              break
            }
            case 'response.created':
            case 'response.started': {
              hasActiveResponse = true
              break
            }
            case 'response.done':
            case 'response.completed': {
              if (!preferInputTranscription) {
                commitTranscript()
              }
              hasActiveResponse = false
              setTimeout(createTranscriptionResponse, 50)
              break
            }
            case 'response.error': {
              console.error('Realtime response error:', realtimeEvent)
              hasActiveResponse = false
              setTimeout(createTranscriptionResponse, 200)
              break
            }
            default: {
              // no-op
            }
          }

          if (process.env.NODE_ENV === 'development') {
            console.log('Realtime event:', realtimeEvent.type, realtimeEvent)
          }
        } catch (error) {
          console.error('Error parsing realtime event:', error, e?.data)
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

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text()
        throw new Error(`Failed to establish connection: ${sdpResponse.status} ${errorText}`)
      }

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
    const fullTranscript = (transcript + ' ' + currentTranscript).trim()
    if (fullTranscript) {
      await processTranscription(fullTranscript)
    }
  }

  const processTranscription = async (finalText: string) => {
    setStatus('Generating summary...')

    const newTranscription: Transcription = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      text: finalText,
    }

    let summarySucceeded = false
    try {
      const rawApiKey = localStorage.getItem('openai_api_key')
      const apiKey = typeof rawApiKey === 'string' && rawApiKey.trim() ? rawApiKey.trim() : undefined
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
      summarySucceeded = true
    } catch (error) {
      console.error('Error generating summary:', error)
      const message = error instanceof Error ? error.message : 'Error generating summary'
      setStatus(message)
    }

    // Save the new transcription and update state
    const updatedTranscriptions = [newTranscription, ...transcriptions]
    localStorage.setItem('transcriptions', JSON.stringify(updatedTranscriptions))
    setTranscriptions(updatedTranscriptions)
    if (summarySucceeded) {
      setStatus('')
    }
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
                {transcript}{currentTranscript}
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
