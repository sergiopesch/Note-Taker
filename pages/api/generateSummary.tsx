import type { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { transcriptionText } = req.body

  if (!transcriptionText) {
    return res.status(400).json({ error: 'No transcription text provided.' })
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  const prompt = `Please provide a concise summary and next steps for the following transcription:\n\n"${transcriptionText}"\n\nSummary:\n`

  const maxRetries = 5
  let retryCount = 0
  let delay = 1000 // Start with 1 second

  while (retryCount < maxRetries) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      })

      const result = response.choices[0].message?.content || ''
      const [summaryText, nextStepsText] = result.split('Next Steps:')

      return res.status(200).json({
        summary: summaryText.trim(),
        nextSteps: nextStepsText ? nextStepsText.trim() : '',
      })
    } catch (error: any) {
      if (error.status === 429) {
        // Rate limit exceeded, implement exponential backoff
        retryCount++
        console.warn(`Rate limit exceeded. Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        delay *= 2 // Exponential backoff
      } else {
        console.error('Error fetching summary:', error)
        return res.status(500).json({ error: 'Error fetching summary.' })
      }
    }
  }

  // If all retries fail
  return res.status(429).json({
    error:
      'Rate limit exceeded. Please try again later or check your OpenAI account quota.',
  })
}
