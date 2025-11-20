'use server'

import { z } from 'zod'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

// Define the schema for input validation
const requestSchema = z.object({
    transcriptionText: z.string().min(1, 'Transcription text is required').max(15000, 'Transcription text is too long'),
    apiKey: z.string().optional(),
})

// Initialize Rate Limiter (optional)
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
const redisClient = upstashUrl && upstashToken ? new Redis({ url: upstashUrl, token: upstashToken }) : null

const ratelimit = redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(5, '10 s'),
        analytics: true,
        prefix: '@upstash/ratelimit',
    })
    : null

export async function generateSummaryAction(data: { transcriptionText: string; apiKey?: string }) {
    try {
        // Rate Limiting (only when Redis is configured)
        if (ratelimit) {
            try {
                const headersList = await headers()
                const ip = headersList.get('x-forwarded-for') ?? '127.0.0.1'
                const { success } = await ratelimit.limit(ip)

                if (!success) {
                    return { error: 'Too Many Requests. Please try again later.' }
                }
            } catch (redisError) {
                console.warn('Rate limiting failed, proceeding without it:', redisError)
            }
        }

        // Validate the input
        const result = requestSchema.safeParse(data)
        if (!result.success) {
            return { error: result.error.errors[0].message }
        }

        const { transcriptionText, apiKey } = result.data
        const key = apiKey || process.env.OPENAI_API_KEY

        if (!key) {
            return { error: 'OpenAI API key is missing' }
        }

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
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 300,
                        temperature: 0.7,
                        response_format: { type: "json_object" }
                    })
                })

                if (!response.ok) {
                    // Handle 429 specifically
                    if (response.status === 429) {
                        retryCount++
                        if (retryCount === maxRetries) break
                        await new Promise(resolve => setTimeout(resolve, delay))
                        delay *= 2
                        continue
                    }
                    
                    const errorText = await response.text()
                    throw new Error(`OpenAI API Error: ${response.status} ${errorText}`)
                }

                const data = await response.json()
                const content = data.choices[0]?.message?.content || ''

                // Parse the JSON response
                let parsedResult
                try {
                    parsedResult = JSON.parse(content)
                } catch (e) {
                    console.error('JSON parse error:', e, content)
                     // Try to extract JSON if it's wrapped in markdown code blocks (fallback)
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
                console.error('Attempt failed:', error)
                if (retryCount === maxRetries - 1) throw error
                // If it's a network error (fetch failed), we might want to retry too
                retryCount++
                await new Promise(resolve => setTimeout(resolve, delay))
                delay *= 2
            }
        }

        return { error: 'Rate limit exceeded or service unavailable' }

    } catch (error) {
        console.error('Error processing request in generateSummaryAction:', error)
        const message = error instanceof Error ? error.message : 'Unexpected error while generating summary'
        return { error: message }
    }
}

export async function getEphemeralToken(apiKey?: string) {
    try {
        const apiKeyStr = typeof apiKey === 'string' ? apiKey.trim() : null
        const envKey = typeof process.env.OPENAI_API_KEY === 'string' ? process.env.OPENAI_API_KEY.trim() : null
        const key = apiKeyStr || envKey
        
        if (!key || key === '') {
            return { error: 'OpenAI API key is missing. Please configure it in Settings.' }
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
            let errorText = ''
            try {
                const errorData = await response.json()
                errorText = errorData.error?.message || errorData.error || JSON.stringify(errorData)
            } catch {
                errorText = await response.text()
            }
            console.error('OpenAI Realtime API Error:', response.status, errorText)
            
            // Return the actual error message
            return { 
                error: errorText || `OpenAI API Error: ${response.status} ${response.statusText}` 
            }
        }

        const data = await response.json()

        let clientSecret: string | undefined
        if (typeof data.client_secret === 'string') {
            clientSecret = data.client_secret
        } else if (
            data.client_secret &&
            typeof data.client_secret === 'object' &&
            typeof data.client_secret.value === 'string'
        ) {
            clientSecret = data.client_secret.value
        }

        if (!clientSecret) {
            console.error('OpenAI Realtime API Error: Missing client_secret in response', data)
            return { error: 'Received invalid response from OpenAI: missing client_secret' }
        }

        return { client_secret: clientSecret }

    } catch (error) {
        console.error('Error fetching ephemeral token:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate token'
        return { error: errorMessage }
    }
}
