'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Trash2 } from 'lucide-react'

// Define the Transcription type
type Transcription = {
  id: number
  date: string
  text: string
}

export default function TranscriptionDetail() {
  const [transcription, setTranscription] = useState<Transcription | null>(null)
  const router = useRouter()
  const params = useParams()
  const id = params.id

  useEffect(() => {
    const storedTranscriptions = localStorage.getItem('transcriptions')
    if (storedTranscriptions) {
      const transcriptions: Transcription[] = JSON.parse(storedTranscriptions)
      const found = transcriptions.find(
        (item: Transcription) => item.id === Number(id)
      )
      if (found) {
        setTranscription(found)
      } else {
        router.push('/')
      }
    } else {
      router.push('/')
    }
  }, [id, router])

  const handleDelete = () => {
    const storedTranscriptions = localStorage.getItem('transcriptions')
    if (storedTranscriptions) {
      const transcriptions: Transcription[] = JSON.parse(storedTranscriptions)
      const updatedTranscriptions = transcriptions.filter(
        (item: Transcription) => item.id !== Number(id)
      )
      localStorage.setItem(
        'transcriptions',
        JSON.stringify(updatedTranscriptions)
      )
    }
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4 sm:p-8 font-sans flex items-center justify-center">
      <Card className="w-full max-w-md bg-white/80 backdrop-blur-sm shadow-lg rounded-3xl overflow-hidden border-0">
        <CardContent className="p-6 sm:p-8 flex flex-col">
          {transcription ? (
            <>
              <h1 className="text-3xl font-semibold text-gray-800 mb-4 text-center">
                Transcription Detail
              </h1>
              <div className="flex-grow bg-green-100 rounded-2xl p-4 shadow-md overflow-y-auto">
                <div className="text-sm text-gray-600 mb-2">
                  {transcription.date}
                </div>
                <div className="text-green-900 whitespace-pre-wrap">
                  {transcription.text}
                </div>
              </div>
              <div className="mt-4 flex justify-around">
                <Button variant="destructive" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Transcription
                </Button>
                <Button onClick={() => router.push('/')}>
                  Back to Home
                </Button>
              </div>
            </>
          ) : (
            <div>Loading...</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
