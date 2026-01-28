import { NextRequest, NextResponse } from 'next/server'

type SpeakerSegment = {
    speaker: string
    text: string
}

type TranscribeResult = {
    text: string
    segments?: SpeakerSegment[]
}

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
    const diarization = formData.get('diarization') as string | null

    if (!audio || !provider || !apiKey) {
        return NextResponse.json(
            { error: 'Missing required fields: audio, provider, apiKey' },
            { status: 400 }
        )
    }

    if (audio.size === 0) {
        return NextResponse.json({ error: 'Audio file is empty' }, { status: 400 })
    }

    const diarize = diarization === 'on'

    try {
        switch (provider) {
            case 'openai':
                return await transcribeWithOpenAI(audio, apiKey, diarize)
            case 'claude':
                return await transcribeWithClaude(audio, apiKey, diarize)
            case 'gemini':
                return await transcribeWithGemini(audio, apiKey, diarize)
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

const DIARIZATION_PROMPT = `Transcribe this audio verbatim and identify each speaker. Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{"segments":[{"speaker":"Speaker 1","text":"what they said"},{"speaker":"Speaker 2","text":"what they said"}]}

Rules:
- Label speakers as "Speaker 1", "Speaker 2", etc. consistently throughout
- Each segment should be a continuous turn by one speaker
- When the speaker changes, start a new segment
- If only one speaker is detected, use "Speaker 1" for all segments
- Transcribe verbatim — do not summarize or paraphrase
- Return ONLY the JSON object, nothing else`

const PLAIN_PROMPT = 'Please transcribe this audio verbatim. Output only the exact words spoken, with no additional commentary, labels, or formatting.'

function parseDiarizedResponse(content: string): TranscribeResult {
    const trimmed = content.trim()

    // Try parsing directly
    try {
        const parsed = JSON.parse(trimmed)
        if (parsed.segments && Array.isArray(parsed.segments)) {
            const segments: SpeakerSegment[] = parsed.segments
                .filter((s: { speaker?: string; text?: string }) => s.speaker && s.text)
                .map((s: { speaker: string; text: string }) => ({
                    speaker: s.speaker,
                    text: s.text.trim(),
                }))

            if (segments.length > 0) {
                const text = segments.map(s => s.text).join(' ')
                return { text, segments }
            }
        }
    } catch {
        // Try extracting JSON from the response
    }

    // Try to find JSON in markdown code blocks or surrounding text
    const jsonMatch = trimmed.match(/\{[\s\S]*"segments"[\s\S]*\}/)
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0])
            if (parsed.segments && Array.isArray(parsed.segments)) {
                const segments: SpeakerSegment[] = parsed.segments
                    .filter((s: { speaker?: string; text?: string }) => s.speaker && s.text)
                    .map((s: { speaker: string; text: string }) => ({
                        speaker: s.speaker,
                        text: s.text.trim(),
                    }))

                if (segments.length > 0) {
                    const text = segments.map(s => s.text).join(' ')
                    return { text, segments }
                }
            }
        } catch {
            // Fall through to plain text
        }
    }

    // Fallback: return as plain text
    return { text: trimmed }
}


// --- OpenAI ---
// When diarization is on, use GPT-4o-audio-preview with audio input for speaker identification.
// When diarization is off, use Whisper API for plain transcription.

async function transcribeWithOpenAI(audio: File, apiKey: string, diarize: boolean) {
    if (!diarize) {
        // Original Whisper API path
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

    // Diarization path: use GPT-4o with audio input
    const buffer = Buffer.from(await audio.arrayBuffer())
    const base64 = buffer.toString('base64')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-audio-preview',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_audio',
                            input_audio: {
                                data: base64,
                                format: 'wav',
                            },
                        },
                        {
                            type: 'text',
                            text: DIARIZATION_PROMPT,
                        },
                    ],
                },
            ],
            max_tokens: 4096,
        }),
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    const result = parseDiarizedResponse(content)
    return NextResponse.json(result)
}


// --- Claude ---

async function transcribeWithClaude(audio: File, apiKey: string, diarize: boolean) {
    const buffer = Buffer.from(await audio.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mediaType = audio.type || 'audio/webm'

    const prompt = diarize ? DIARIZATION_PROMPT : PLAIN_PROMPT

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
                            text: prompt,
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
    const content = data.content?.[0]?.text || ''

    if (diarize) {
        const result = parseDiarizedResponse(content)
        return NextResponse.json(result)
    }

    return NextResponse.json({ text: content })
}


// --- Gemini ---

async function transcribeWithGemini(audio: File, apiKey: string, diarize: boolean) {
    const buffer = Buffer.from(await audio.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mimeType = audio.type || 'audio/webm'

    const prompt = diarize ? DIARIZATION_PROMPT : PLAIN_PROMPT

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
                                text: prompt,
                            },
                        ],
                    },
                ],
                ...(diarize && {
                    generationConfig: {
                        responseMimeType: 'application/json',
                    },
                }),
            }),
        }
    )

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Gemini API error (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (diarize) {
        const result = parseDiarizedResponse(content)
        return NextResponse.json(result)
    }

    return NextResponse.json({ text: content })
}
