// app/page.tsx

'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Mic, StopCircle } from 'lucide-react'
import VoiceNotes from '@/components/ui/VoiceNotes'

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
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const finalTranscriptRef = useRef('') // Ref to store the final transcript
  const transcriptionContainerRef = useRef<HTMLDivElement>(null) // Ref for auto-scrolling

  // Load existing transcriptions from localStorage
  useEffect(() => {
    const storedTranscriptions = localStorage.getItem('transcriptions')
    if (storedTranscriptions) {
      setTranscriptions(JSON.parse(storedTranscriptions))
    }
  }, [])

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (SpeechRecognition) {
      const speechRecognition = new SpeechRecognition()
      speechRecognition.continuous = true
      speechRecognition.interimResults = true
      speechRecognition.lang = 'en-US'

      // Event handler for speech recognition results
      speechRecognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        let final = finalTranscriptRef.current

        // Process the results
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptChunk = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            final += transcriptChunk
            finalTranscriptRef.current = final
          } else {
            interim += transcriptChunk
          }
        }

        setTranscript(final)
        setInterimTranscript(interim)
      }

      // Event handler for errors
      speechRecognition.onerror = (event) => {
        console.error('Speech recognition error', event)
      }

      setRecognition(speechRecognition)
    } else {
      console.error('Speech recognition not supported in this browser.')
    }
  }, [])

  // Auto-scroll the transcription box when new text is added
  useEffect(() => {
    if (transcriptionContainerRef.current) {
      transcriptionContainerRef.current.scrollTop =
        transcriptionContainerRef.current.scrollHeight
    }
  }, [transcript, interimTranscript])

  // Start recording
  const handleStartRecording = () => {
    if (recognition && !isRecording) {
      finalTranscriptRef.current = ''
      setTranscript('')
      setInterimTranscript('')
      recognition.start()
      setIsRecording(true)
    }
  }

  // Stop recording and process the transcription
  const handleStopRecording = async () => {
    if (recognition && isRecording) {
      recognition.stop()
      setIsRecording(false)

      const finalTranscriptionText =
        finalTranscriptRef.current + interimTranscript

      const newTranscription: Transcription = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        text: finalTranscriptionText,
      }

      // Generate title, summary, and next steps using OpenAI API
      try {
        const response = await fetch('/api/generateSummary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transcriptionText: finalTranscriptionText }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch summary.')
        }

        newTranscription.title = data.title
        newTranscription.summary = data.summary
        newTranscription.nextSteps = data.nextSteps
      } catch (error) {
        console.error('Error fetching summary:', error)
        // Handle error as needed
      }

      // Save the new transcription and update state
      const updatedTranscriptions = [newTranscription, ...transcriptions]
      localStorage.setItem('transcriptions', JSON.stringify(updatedTranscriptions))
      setTranscriptions(updatedTranscriptions)
      setTranscript('')
      setInterimTranscript('')
    }
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans flex flex-col items-center justify-center bg-gradient-to-b from-blue-100 to-white">
      <div className="w-full max-w-3xl">
        <Card className="w-full bg-white/80 backdrop-blur-sm shadow-lg rounded-3xl overflow-hidden border-0 mb-8">
          <CardContent className="p-6 sm:p-8 h-full flex flex-col items-center">
            <h1 className="text-4xl font-bold mb-6 text-center text-gray-800">
              Voice Notes
            </h1>
            <div className="mb-6">
              {isRecording ? (
                <Button variant="destructive" onClick={handleStopRecording}>
                  <StopCircle className="w-6 h-6 mr-2" />
                  Stop Recording
                </Button>
              ) : (
                <Button onClick={handleStartRecording}>
                  <Mic className="w-6 h-6 mr-2" />
                  Start Recording
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
                <span className="opacity-50">{interimTranscript}</span>
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
