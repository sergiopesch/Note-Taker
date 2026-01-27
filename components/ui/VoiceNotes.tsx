// components/ui/VoiceNotes.tsx

'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Calendar } from 'lucide-react'

// Define the Transcription type
type Transcription = {
  id: number
  date: string
  text: string
  title?: string
  summary?: string
  nextSteps?: string
}

// Define the props for the component
interface VoiceNotesProps {
  transcriptions: Transcription[]
}

export default function VoiceNotes({ transcriptions }: VoiceNotesProps) {
  const router = useRouter()

  // Handle click on a transcription card
  const handleClick = (id: number) => {
    router.push(`/transcriptions/${id}`)
  }

  return (
    <div className="w-full">
      {transcriptions.length === 0 ? (
        <div className="text-center text-gray-600 dark:text-gray-400">
          No transcriptions yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {transcriptions.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-white dark:bg-gray-800 shadow rounded-lg cursor-pointer hover:shadow-md dark:hover:shadow-gray-700/50 transition-shadow theme-transition"
              onClick={() => handleClick(item.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <Calendar className="w-4 h-4 mr-1" />
                  {item.date}
                </div>
              </div>
              <div className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1">
                {item.title
                  ? item.title.length > 60
                    ? item.title.substring(0, 60) + '...'
                    : item.title
                  : 'Untitled'}
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                {item.summary
                  ? item.summary.length > 80
                    ? item.summary.substring(0, 80) + '...'
                    : item.summary
                  : item.text.length > 80
                  ? item.text.substring(0, 80) + '...'
                  : item.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
