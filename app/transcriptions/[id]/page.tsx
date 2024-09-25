// app/transcriptions/[id]/page.tsx

'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Trash2 } from 'lucide-react'

type Transcription = {
  id: number
  date: string
  text: string
  title?: string
  summary?: string
  nextSteps?: string
}

export default function TranscriptionDetail() {
  const [transcription, setTranscription] = useState<Transcription | null>(null)
  const [title, setTitle] = useState<string>('')
  const [summary, setSummary] = useState<string>('')
  const [nextSteps, setNextSteps] = useState<string>('')
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  useEffect(() => {
    if (!id) {
      router.push('/')
      return
    }

    const storedTranscriptions = localStorage.getItem('transcriptions')
    if (storedTranscriptions) {
      const transcriptions: Transcription[] = JSON.parse(storedTranscriptions)
      const found = transcriptions.find(
        (item: Transcription) => item.id === Number(id)
      )
      if (found) {
        setTranscription(found)
        setTitle(found.title || '')
        setSummary(found.summary || '')
        setNextSteps(found.nextSteps || '')
      } else {
        router.push('/')
      }
    } else {
      router.push('/')
    }
  }, [id, router])

  const saveTitle = () => {
    if (transcription) {
      const storedTranscriptions = localStorage.getItem('transcriptions')
      if (storedTranscriptions) {
        const transcriptions: Transcription[] = JSON.parse(storedTranscriptions)
        const updatedTranscriptions = transcriptions.map((item) => {
          if (item.id === transcription.id) {
            return {
              ...item,
              title: title,
            }
          }
          return item
        })
        localStorage.setItem('transcriptions', JSON.stringify(updatedTranscriptions))
        setTranscription({
          ...transcription,
          title: title,
        })
      }
    }
  }

  const handleDelete = () => {
    const storedTranscriptions = localStorage.getItem('transcriptions')
    if (storedTranscriptions) {
      const transcriptions: Transcription[] = JSON.parse(storedTranscriptions)
      const updatedTranscriptions = transcriptions.filter(
        (item: Transcription) => item.id !== Number(id)
      )
      localStorage.setItem('transcriptions', JSON.stringify(updatedTranscriptions))
    }
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4 sm:p-8 font-sans">
      <div className="w-full max-w-md mx-auto">
        <Card className="w-full bg-white/80 backdrop-blur-sm shadow-lg rounded-3xl overflow-hidden border-0">
          <CardContent className="p-6 sm:p-8 h-full flex flex-col">
            {transcription ? (
              <>
                <div className="mb-4">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={saveTitle}
                    className="w-full text-3xl font-semibold text-gray-800 text-center bg-transparent border-b-2 border-gray-300 focus:outline-none focus:border-blue-500"
                    placeholder="Enter title"
                  />
                </div>
                <div className="flex-grow bg-green-100 rounded-2xl p-4 shadow-md overflow-y-auto mb-4">
                  <div className="text-sm text-gray-600 mb-2">
                    {transcription.date}
                  </div>
                  <div className="text-green-900 whitespace-pre-wrap leading-relaxed">
                    {transcription.text}
                  </div>
                </div>

                {/* Display Summary and Next Steps */}
                {summary ? (
                  <div className="bg-yellow-100 rounded-2xl p-4 shadow-md overflow-y-auto mb-4">
                    <h2 className="text-xl font-semibold text-yellow-800 mb-2">
                      Summary
                    </h2>
                    <div className="text-yellow-900 whitespace-pre-wrap leading-relaxed">
                      {summary}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-600">
                    Summary is unavailable.
                  </div>
                )}

                {nextSteps ? (
                  <div className="bg-purple-100 rounded-2xl p-4 shadow-md overflow-y-auto mb-4">
                    <h2 className="text-xl font-semibold text-purple-800 mb-2">
                      Next Steps
                    </h2>
                    <div className="text-purple-900 whitespace-pre-wrap leading-relaxed">
                      {nextSteps}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex justify-around">
                  <Button variant="destructive" onClick={handleDelete}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Transcription
                  </Button>
                  <Button onClick={() => router.push('/')}>Back to Home</Button>
                </div>
              </>
            ) : (
              <div>Loading...</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
