'use server'

import OpenAI from 'openai'
import { z } from 'zod'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

// Define the schema for input validation
const requestSchema = z.object({
    transcriptionText: z.string().min(1, 'Transcription text is required').max(15000, 'Transcription text is too long'),
    apiKey: z.string().optional(),
})

// Initialize Rate Limiter
// Create a new ratelimiter, that allows 5 requests per 10 seconds
const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, '10 s'),
    analytics: true,
    prefix: '@upstash/ratelimit',
})

const createOpenAIClient = (apiKey?: string) => {
    return new OpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
    })
}

export async function generateSummaryAction(data: { transcriptionText: string; apiKey?: string }) {
    try {
        // Rate Limiting
        const headersList = await headers()
        const ip = headersList.get('x-forwarded-for') ?? '127.0.0.1'
        const { success } = await ratelimit.limit(ip)

        if (!success) {
            return { error: 'Too Many Requests. Please try again later.' }
        }

        // Validate the input
        const result = requestSchema.safeParse(data)
        if (!result.success) {
            return { error: result.error.errors[0].message }
        }

        const { transcriptionText, apiKey } = result.data

        // Initialize OpenAI API client
        const openai = createOpenAIClient(apiKey)

        // Define the prompt for OpenAI GPT model
        const prompt = `
Please analyze the following transcription and provide a short and precise title (max 10 words), a concise summary, and next steps. Return ONLY the response in **valid JSON format** with the keys "title", "summary", and "nextSteps". Do not include any explanations or additional text.

Transcription:
"""
${transcriptionText}
"""
`

        const maxRetries = 3
        let retryCount = 0
        let delay = 1000

        while (retryCount < maxRetries) {
            try {
                const response = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 300,
                    temperature: 0.7,
                })

                const content = response.choices[0].message?.content || ''

                // Parse the JSON response
                let parsedResult
                try {
                    parsedResult = JSON.parse(content)
                } catch (e) {
                    // Try to extract JSON if it's wrapped in markdown code blocks
                    const jsonMatch = content.match(/\{[\s\S]*\}/)
                    if (jsonMatch) {
                        parsedResult = JSON.parse(jsonMatch[0])
                    } else {
                        throw new Error('Invalid JSON format from OpenAI')
                    }
                }

                return {
                    title: parsedResult.title || 'Untitled',
                    summary: parsedResult.summary || '',
                    nextSteps: parsedResult.nextSteps || '',
                }

            } catch (error: any) {
                if (error.status === 429) {
                    retryCount++
                    if (retryCount === maxRetries) break
                    await new Promise(resolve => setTimeout(resolve, delay))
                    delay *= 2
                    continue
                }
                throw error
            }
        }

        return { error: 'Rate limit exceeded or service unavailable' }

    } catch (error) {
        console.error('Error processing request in generateSummaryAction:', error)
        return { error: 'Internal server error' }
    }
}

export async function getEphemeralToken(apiKey?: string) {
    try {
        const key = apiKey || process.env.OPENAI_API_KEY
        if (!key) {
            return { error: 'OpenAI API key is missing' }
        }

        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-realtime-preview-2024-10-01',
                voice: 'alloy',
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('OpenAI Realtime API Error:', errorText)
            throw new Error(`OpenAI Realtime API Error: ${response.statusText}`)
        }

        const data = await response.json()
        return { client_secret: data.client_secret }

    } catch (error) {
        console.error('Error fetching ephemeral token:', error)
        return { error: 'Failed to generate token' }
    }
}
