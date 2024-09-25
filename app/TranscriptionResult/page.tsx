'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Trash2 } from 'lucide-react'

export default function TranscriptionResult() {
  const [transcription, setTranscription] = useState('')
  const router = useRouter()

  useEffect(() => {
    const storedTranscription = localStorage.getItem('transcription')
    if (storedTranscription) {
      setTranscription(storedTranscription)
    } else {
      router.push('/')
    }
  }, [router])

  const handleDelete = () => {
    localStorage.removeItem('transcription')
    router.push('/')
  }

  const handleNewTranscription = () => {
    localStorage.removeItem('transcription')
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4 sm:p-8 font-sans flex items-center justify-center">
      <Card className="w-full max-w-md h-[700px] bg-white/80 backdrop-blur-sm shadow-lg rounded-3xl overflow-hidden border-0">
        <CardContent className="p-6 sm:p-8 h-full flex flex-col">
          <h1 className="text-3xl font-semibold text-gray-800 mb-4 text-center">
            Transcription Result
          </h1>
          <div className="flex-grow bg-green-100 rounded-2xl p-4 shadow-md overflow-y-auto">
            <h2 className="text-lg font-semibold text-green-800 mb-2 text-center">
              Your Transcription
            </h2>
            <div className="text-green-900 whitespace-pre-wrap">
              {transcription}
            </div>
          </div>
          <div className="mt-4 flex justify-around">
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Transcription
            </Button>
            <Button onClick={handleNewTranscription}>
              Start New Transcription
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
