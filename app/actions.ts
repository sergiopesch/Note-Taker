'use server'

import { z } from 'zod'

const requestSchema = z.object({
    transcriptionText: z
        .string()
        .min(1, 'Transcription text is required')
        .max(15000, 'Transcription text is too long'),
    provider: z.enum(['openai', 'claude', 'gemini']).default('openai'),
    apiKey: z.string().optional(),
})

export async function generateSummaryAction(data: {
    transcriptionText: string
    provider?: string
    apiKey?: string
}) {
    try {
        const result = requestSchema.safeParse(data)
        if (!result.success) {
            return { error: result.error.errors[0].message }
        }

        const { transcriptionText, provider, apiKey } = result.data

        const hasSpeakers = transcriptionText.includes('Speaker 1:') || transcriptionText.includes('Speaker 2:')
        const speakerInstruction = hasSpeakers
            ? ' The transcription includes speaker labels (e.g. "Speaker 1:", "Speaker 2:"). Reference speakers in the summary when relevant.'
            : ''

        const prompt = `Please analyze the following transcription and provide a short and precise title (max 10 words), a concise summary, and next steps.${speakerInstruction} Return ONLY the response in valid JSON format with the keys "title", "summary", and "nextSteps". Do not include any explanations or additional text.

Transcription:
"""
${transcriptionText}
"""`

        switch (provider) {
            case 'openai':
                return await summarizeWithOpenAI(prompt, apiKey)
            case 'claude':
                return await summarizeWithClaude(prompt, apiKey)
            case 'gemini':
                return await summarizeWithGemini(prompt, apiKey)
            default:
                return { error: `Unknown provider: ${provider}` }
        }
    } catch (error) {
        console.error('Error in generateSummaryAction:', error)
        const message = error instanceof Error ? error.message : 'Unexpected error while generating summary'
        return { error: message }
    }
}

function parseJsonSummary(content: string): {
    title: string
    summary: string
    nextSteps: string
    error?: string
} {
    if (!content.trim()) {
        return { title: 'Untitled', summary: '', nextSteps: '', error: 'Empty response from AI' }
    }

    try {
        const parsed = JSON.parse(content)
        return {
            title: parsed.title || 'Untitled',
            summary: parsed.summary || '',
            nextSteps: parsed.nextSteps || '',
        }
    } catch {
        // Try to extract JSON from markdown code blocks or surrounding text
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0])
                return {
                    title: parsed.title || 'Untitled',
                    summary: parsed.summary || '',
                    nextSteps: parsed.nextSteps || '',
                }
            } catch {
                // fall through
            }
        }
        return { title: 'Untitled', summary: '', nextSteps: '', error: 'Failed to parse summary JSON' }
    }
}

async function summarizeWithOpenAI(prompt: string, apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY
    if (!key) return { error: 'OpenAI API key is missing' }

    const maxRetries = 3
    let retryCount = 0
    let delay = 1000

    while (retryCount < maxRetries) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${key}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 300,
                    temperature: 0.7,
                    response_format: { type: 'json_object' },
                }),
            })

            if (!response.ok) {
                if (response.status === 429) {
                    retryCount++
                    if (retryCount >= maxRetries) break
                    await new Promise((resolve) => setTimeout(resolve, delay))
                    delay *= 2
                    continue
                }
                const errorText = await response.text()
                throw new Error(`OpenAI API Error: ${response.status} ${errorText}`)
            }

            const data = await response.json()
            const content = data.choices?.[0]?.message?.content || ''
            return parseJsonSummary(content)
        } catch (error) {
            if (retryCount >= maxRetries - 1) throw error
            retryCount++
            await new Promise((resolve) => setTimeout(resolve, delay))
            delay *= 2
        }
    }

    return { error: 'OpenAI rate limit exceeded. Please try again later.' }
}

async function summarizeWithClaude(prompt: string, apiKey?: string) {
    const key = apiKey || process.env.CLAUDE_API_KEY
    if (!key) return { error: 'Claude API key is missing' }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Claude API Error: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ''
    return parseJsonSummary(content)
}

async function summarizeWithGemini(prompt: string, apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY
    if (!key) return { error: 'Gemini API key is missing' }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [{ text: prompt }],
                    },
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 500,
                    responseMimeType: 'application/json',
                },
            }),
        }
    )

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API Error: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return parseJsonSummary(content)
}
