// pages/api/generateSummary.ts

import type { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

/**
 * API Route Handler: Generates a summary, title, and next steps using OpenAI's GPT model.
 *
 * @param req - The incoming request object.
 * @param res - The outgoing response object.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { transcriptionText } = req.body

  // Validate the request body
  if (!transcriptionText) {
    return res.status(400).json({ error: 'No transcription text provided.' })
  }

  // Initialize OpenAI API client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  // Define the prompt for OpenAI GPT model
  const prompt = `
Please analyze the following transcription and provide a short and precise title (max 10 words), a concise summary, and next steps. Return ONLY the response in **valid JSON format** with the keys "title", "summary", and "nextSteps". Do not include any explanations or additional text.

Transcription:
"""
${transcriptionText}
"""
`

  const maxRetries = 5 // Maximum number of retries for API calls
  let retryCount = 0
  let delay = 1000 // Initial delay of 1 second for exponential backoff

  // Retry logic with exponential backoff for handling rate limits
  while (retryCount < maxRetries) {
    try {
      // Make API call to OpenAI GPT model
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Use 'gpt-3.5-turbo' or 'gpt-4' if you have access
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      })

      // Parse the JSON response
      const result = response.choices[0].message?.content || ''

      // Attempt to parse the response as JSON
      let parsedResult: any

      try {
        parsedResult = JSON.parse(result)
      } catch (jsonError) {
        // If parsing fails, attempt to extract JSON from the response
        const jsonMatch = result.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('Invalid JSON format in OpenAI response.')
        }
      }

      // Ensure all keys are present
      const title = parsedResult.title ? parsedResult.title.toString().trim() : ''
      const summary = parsedResult.summary ? parsedResult.summary.toString().trim() : ''
      const nextSteps = parsedResult.nextSteps ? parsedResult.nextSteps.toString().trim() : ''

      // Return the parsed data
      return res.status(200).json({
        title,
        summary,
        nextSteps,
      })
    } catch (error: any) {
      if (error.status === 429) {
        // Handle rate limit errors with exponential backoff
        retryCount++
        console.warn(`Rate limit exceeded. Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        delay *= 2 // Double the delay each time
      } else if (error instanceof SyntaxError || error.message.includes('JSON')) {
        // Handle JSON parsing errors
        console.error('Error parsing JSON:', error)
        return res.status(500).json({ error: 'Error parsing OpenAI response.' })
      } else {
        console.error('Error fetching summary:', error)
        return res.status(500).json({ error: 'Error fetching summary.' })
      }
    }
  }

  // Return an error response if all retries fail
  return res.status(429).json({
    error:
      'Rate limit exceeded. Please try again later or check your OpenAI account quota.',
  })
}
