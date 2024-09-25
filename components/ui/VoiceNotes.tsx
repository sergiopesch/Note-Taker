'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Mic, MicOff } from 'lucide-react'

type Transcription = {
  id: number
  date: string
  text: string
  summary?: string
  nextSteps?: string
}

const PulsingAnimation = () => (
  <div className="relative w-3 h-3">
    <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75"></div>
    <div className="absolute inset-0 bg-red-500 rounded-full opacity-90"></div>
  </div>
)

export default function VoiceNotes() {
  const [isRecording, setIsRecording] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef('')
  const router = useRouter()
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load existing transcriptions from localStorage
    const storedTranscriptions = localStorage.getItem('transcriptions')
    if (storedTranscriptions) {
      setTranscriptions(JSON.parse(storedTranscriptions))
    }
  }, [])

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

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const transcript = result[0].transcript
          if (result.isFinal) {
            finalTranscriptRef.current += transcript
          } else {
            interimTranscript += transcript
          }
        }

        const combinedTranscript = finalTranscriptRef.current + interimTranscript
        setCurrentTranscript(combinedTranscript.slice(-500))
      }

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error detected: ' + event.error)
      }

      recognitionRef.current.onend = () => {
        setIsRecording(false)
        setCurrentTranscript('')

        if (finalTranscriptRef.current.trim() !== '') {
          // Save the new transcription with a timestamp
          const newTranscription: Transcription = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            text: finalTranscriptRef.current.trim(),
          }

          const updatedTranscriptions = [newTranscription, ...transcriptions]
          setTranscriptions(updatedTranscriptions)
          localStorage.setItem(
            'transcriptions',
            JSON.stringify(updatedTranscriptions)
          )

          finalTranscriptRef.current = ''
          // Navigate to the detailed view of the new transcription
          router.push(`/transcriptions/${newTranscription.id}`)
        } else {
          console.log('No transcription captured.')
        }
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [transcriptions, router])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [currentTranscript])

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      // Do not set isRecording to false here; let onend handle it
    } else {
      finalTranscriptRef.current = ''
      setCurrentTranscript('')
      recognitionRef.current?.start()
      setIsRecording(true)
    }
  }

  const handleTranscriptionClick = (id: number) => {
    router.push(`/transcriptions/${id}`)
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
              <div
                ref={transcriptRef}
                className="bg-blue-100 rounded-2xl p-4 transition-all duration-300 shadow-md overflow-y-auto max-h-40"
              >
                <h2 className="text-lg font-semibold text-blue-800 mb-2 text-center">
                  Live Transcript
                </h2>
                <div className="text-blue-900 text-center">
                  {currentTranscript || 'Listening...'}
                </div>
              </div>
            )}

            {/* List of Previous Transcriptions */}
            {transcriptions.length > 0 && (
              <div className="flex-grow overflow-y-auto">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Previous Transcriptions
                </h2>
                <div className="space-y-2">
                  {transcriptions.map((item) => (
                    <div
                      key={item.id}
                      className="bg-gray-100 rounded-lg p-3 cursor-pointer hover:bg-gray-200"
                      onClick={() => handleTranscriptionClick(item.id)}
                    >
                      <div className="text-sm text-gray-600">{item.date}</div>
                      <div className="text-gray-800">
                        {item.text.substring(0, 50)}...
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
