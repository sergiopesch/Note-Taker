import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateSummaryAction } from '../app/actions.ts'

test('summaries require a caller key for every provider, even with server keys set', async () => {
    const originalFetch = globalThis.fetch
    const names = ['OPENAI_API_KEY', 'CLAUDE_API_KEY', 'GEMINI_API_KEY']
    const originalKeys = names.map((name) => process.env[name])
    let calls = 0
    globalThis.fetch = async () => { calls++; throw new Error('Unexpected provider call') }
    names.forEach((name) => { process.env[name] = 'server-test-key' })
    try {
        for (const provider of ['openai', 'claude', 'gemini']) {
            for (const apiKey of [undefined, '', '   ']) {
                const result = await generateSummaryAction({ transcriptionText: 'Hello', provider, apiKey })
                assert.ok(result.error)
            }
        }
        assert.equal(calls, 0)
    } finally {
        globalThis.fetch = originalFetch
        names.forEach((name, index) => {
            if (originalKeys[index] === undefined) delete process.env[name]
            else process.env[name] = originalKeys[index]
        })
    }
})

test('each provider receives the supplied key and returns a valid summary', async () => {
    const originalFetch = globalThis.fetch
    const summary = { title: 'Hello', summary: 'A greeting', nextSteps: 'Reply' }
    try {
        for (const provider of ['openai', 'claude', 'gemini']) {
            let calls = 0
            globalThis.fetch = async (url, options) => {
                calls++
                if (provider === 'openai') assert.equal(options.headers.Authorization, 'Bearer caller-test-key')
                if (provider === 'claude') assert.equal(options.headers['x-api-key'], 'caller-test-key')
                if (provider === 'gemini') assert.equal(new URL(url).searchParams.get('key'), 'caller-test-key')
                const text = JSON.stringify(summary)
                return { ok: true, json: async () => provider === 'openai'
                    ? { choices: [{ message: { content: text } }] }
                    : provider === 'claude'
                        ? { content: [{ text }] }
                        : { candidates: [{ content: { parts: [{ text }] } }] } }
            }
            assert.deepEqual(await generateSummaryAction({ transcriptionText: 'Hello', provider, apiKey: ' caller-test-key ' }), summary)
            assert.equal(calls, 1)
        }
    } finally {
        globalThis.fetch = originalFetch
    }
})
