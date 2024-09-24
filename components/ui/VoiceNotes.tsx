'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Mic, MicOff, Trash2 } from 'lucide-react'

const PulsingAnimation = () => (
  <div className="relative w-3 h-3">
    <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75"></div>
    <div className="absolute inset-0 bg-red-500 rounded-full opacity-90"></div>
  </div>
)

export default function VoiceNotes() {
  const [isRecording, setIsRecording] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [fullTranscript, setFullTranscript] = useState('')
  const [showFullTranscript, setShowFullTranscript] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef('') // To accumulate final transcripts

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    ) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = ''

        // Process results starting from event.resultIndex
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const transcript = result[0].transcript
          if (result.isFinal) {
            finalTranscriptRef.current += transcript
          } else {
            interimTranscript += transcript
          }
        }

        // Update currentTranscript with last 500 characters
        const combinedTranscript = finalTranscriptRef.current + interimTranscript
        setCurrentTranscript(combinedTranscript.slice(-500))
      }

      recognitionRef.current.onend = () => {
        if (finalTranscriptRef.current.trim() !== '') {
          setFullTranscript(finalTranscriptRef.current)
          finalTranscriptRef.current = '' // Reset the ref
          setShowFullTranscript(true)
        }
        setCurrentTranscript('')
        setIsRecording(false) // Ensure recording state is updated
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
    } else {
      finalTranscriptRef.current = '' // Reset the ref when starting
      setFullTranscript('')
      setCurrentTranscript('')
      setShowFullTranscript(false)
      recognitionRef.current?.start()
    }
    setIsRecording(!isRecording)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4 sm:p-8 font-sans flex items-center justify-center">
      <Card className="w-full max-w-md h-[700px] bg-white/80 backdrop-blur-sm shadow-lg rounded-3xl overflow-hidden border-0">
        <CardContent className="p-6 sm:p-8 h-full flex flex-col">
          <h1 className="text-3xl font-semibold text-gray-800 mb-4 text-center">
            Personal Note Taker
          </h1>
          <div className="flex-grow flex flex-col space-y-4 overflow-hidden">
            <div className="flex flex-col items-center justify-center">
              <Button
                onClick={toggleRecording}
                className={`w-16 h-16 rounded-full transition-all duration-300 ease-in-out flex items-center justify-center ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                } shadow-md`}
              >
                {isRecording ? (
                  <MicOff className="w-8 h-8" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
                <span className="sr-only">
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </span>
              </Button>
              {isRecording && (
                <div className="mt-4 flex items-center gap-2">
                  <PulsingAnimation />
                  <span className="text-sm text-gray-600">Recording...</span>
                </div>
              )}
            </div>

            {isRecording && (
              <div className="bg-blue-100 rounded-2xl p-4 transition-all duration-300 shadow-md overflow-y-auto max-h-40">
                <h2 className="text-lg font-semibold text-blue-800 mb-2 text-center">
                  Live Transcript
                </h2>
                <div className="text-blue-900 text-center">
                  {currentTranscript || 'Listening...'}
                </div>
              </div>
            )}

            {showFullTranscript && !isRecording && (
              <div className="bg-green-100 rounded-2xl p-4 transition-all duration-300 shadow-md overflow-y-auto flex-grow">
                <h2 className="text-lg font-semibold text-green-800 mb-2 text-center">
                  Full Transcript
                </h2>
                <div className="text-green-900 whitespace-pre-wrap">
                  {fullTranscript}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
