// app/transcriptions/[id]/page.tsx

'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Trash2 } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

// Define the Transcription type
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

  // Load the transcription data
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

  // Save the updated title
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

  // Delete the transcription
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
    <div className="min-h-screen p-4 sm:p-8 font-sans flex items-center justify-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 relative theme-transition">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-3xl">
        <Card className="w-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg rounded-3xl overflow-hidden border-0 dark:border-gray-700 theme-transition">
          <CardContent className="p-6 sm:p-8 h-full flex flex-col">
            {transcription ? (
              <>
                {/* Editable Title */}
                <div className="mb-4">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={saveTitle}
                    className="w-full text-3xl font-semibold text-center bg-transparent border-b-2 border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-500 dark:text-gray-100 theme-transition"
                    placeholder="Enter title"
                  />
                </div>
                {/* Transcription Text */}
                <div className="flex-grow bg-green-100 dark:bg-green-900/30 rounded-2xl p-4 shadow-md overflow-y-auto mb-4 theme-transition">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {transcription.date}
                  </div>
                  <div className="text-green-900 dark:text-green-200 whitespace-pre-wrap leading-relaxed">
                    {transcription.text}
                  </div>
                </div>

                {/* Summary */}
                {summary ? (
                  <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded-2xl p-4 shadow-md overflow-y-auto mb-4 theme-transition">
                    <h2 className="text-xl font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                      Summary
                    </h2>
                    <div className="text-yellow-900 dark:text-yellow-200 whitespace-pre-wrap leading-relaxed">
                      {summary}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-600 dark:text-gray-400">
                    Summary is unavailable.
                  </div>
                )}

                {/* Next Steps */}
                {nextSteps ? (
                  <div className="bg-purple-100 dark:bg-purple-900/30 rounded-2xl p-4 shadow-md overflow-y-auto mb-4 theme-transition">
                    <h2 className="text-xl font-semibold text-purple-800 dark:text-purple-300 mb-2">
                      Next Steps
                    </h2>
                    <div className="text-purple-900 dark:text-purple-200 whitespace-pre-wrap leading-relaxed">
                      {nextSteps}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-600 dark:text-gray-400">
                    Next Steps are unavailable.
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-4 flex justify-around">
                  <Button variant="destructive" onClick={handleDelete}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Transcription
                  </Button>
                  <Button onClick={() => router.push('/')}>Back to Home</Button>
                </div>
              </>
            ) : (
              <div className="dark:text-gray-300">Loading...</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
