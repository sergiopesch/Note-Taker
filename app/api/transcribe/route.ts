import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    let formData: FormData
    try {
        formData = await request.formData()
    } catch {
        return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const audio = formData.get('audio') as File | null
    const provider = formData.get('provider') as string | null
    const apiKey = formData.get('apiKey') as string | null

    if (!audio || !provider || !apiKey) {
        return NextResponse.json(
            { error: 'Missing required fields: audio, provider, apiKey' },
            { status: 400 }
        )
    }

    if (audio.size === 0) {
        return NextResponse.json({ error: 'Audio file is empty' }, { status: 400 })
    }

    try {
        switch (provider) {
            case 'openai':
                return await transcribeWithOpenAI(audio, apiKey)
            case 'claude':
                return await transcribeWithClaude(audio, apiKey)
            case 'gemini':
                return await transcribeWithGemini(audio, apiKey)
            default:
                return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
        }
    } catch (error) {
        console.error(`Transcription error (${provider}):`, error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Transcription failed' },
            { status: 500 }
        )
    }
}

async function transcribeWithOpenAI(audio: File, apiKey: string) {
    const body = new FormData()
    body.append('file', audio, 'recording.webm')
    body.append('model', 'whisper-1')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body,
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`OpenAI Whisper error (${response.status}): ${errText}`)
    }

    const data = await response.json()
    return NextResponse.json({ text: data.text || '' })
}

async function transcribeWithClaude(audio: File, apiKey: string) {
    const buffer = Buffer.from(await audio.arrayBuffer())
    const base64 = buffer.toString('base64')

    // Determine media type - Claude supports wav, mp3, webm, etc.
    const mediaType = audio.type || 'audio/webm'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_audio',
                            source: {
                                type: 'base64',
                                media_type: mediaType,
                                data: base64,
                            },
                        },
                        {
                            type: 'text',
                            text: 'Please transcribe this audio verbatim. Output only the exact words spoken, with no additional commentary, labels, or formatting.',
                        },
                    ],
                },
            ],
        }),
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Claude API error (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    return NextResponse.json({ text })
}

async function transcribeWithGemini(audio: File, apiKey: string) {
    const buffer = Buffer.from(await audio.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mimeType = audio.type || 'audio/webm'

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                inlineData: {
                                    mimeType,
                                    data: base64,
                                },
                            },
                            {
                                text: 'Please transcribe this audio verbatim. Output only the exact words spoken, with no additional commentary, labels, or formatting.',
                            },
                        ],
                    },
                ],
            }),
        }
    )

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Gemini API error (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return NextResponse.json({ text })
}
