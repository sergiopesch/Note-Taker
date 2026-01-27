'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings } from 'lucide-react'

export type AIProvider = 'openai' | 'claude' | 'gemini'
export type AudioSource = 'mic' | 'system' | 'both'

const PROVIDER_LABELS: Record<AIProvider, string> = {
    openai: 'OpenAI',
    claude: 'Claude',
    gemini: 'Gemini',
}

const PROVIDER_PLACEHOLDERS: Record<AIProvider, string> = {
    openai: 'sk-...',
    claude: 'sk-ant-...',
    gemini: 'AI...',
}

const STORAGE_KEYS: Record<AIProvider, string> = {
    openai: 'openai_api_key',
    claude: 'claude_api_key',
    gemini: 'gemini_api_key',
}

const SOURCE_LABELS: Record<AudioSource, string> = {
    mic: 'Microphone Only',
    system: 'System Audio Only',
    both: 'Microphone + System Audio',
}

interface SettingsDialogProps {
    onSettingsChange?: () => void
}

export function SettingsDialog({ onSettingsChange }: SettingsDialogProps) {
    const [provider, setProvider] = useState<AIProvider>('openai')
    const [apiKeys, setApiKeys] = useState<Record<AIProvider, string>>({
        openai: '',
        claude: '',
        gemini: '',
    })
    const [audioSource, setAudioSource] = useState<AudioSource>('mic')
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        const storedProvider = localStorage.getItem('ai_provider') as AIProvider
        if (storedProvider && PROVIDER_LABELS[storedProvider]) {
            setProvider(storedProvider)
        }

        const storedSource = localStorage.getItem('audio_source') as AudioSource
        if (storedSource && SOURCE_LABELS[storedSource]) {
            setAudioSource(storedSource)
        }

        setApiKeys({
            openai: localStorage.getItem('openai_api_key') || '',
            claude: localStorage.getItem('claude_api_key') || '',
            gemini: localStorage.getItem('gemini_api_key') || '',
        })
    }, [])

    const handleSave = () => {
        localStorage.setItem('ai_provider', provider)
        localStorage.setItem('audio_source', audioSource)

        for (const p of ['openai', 'claude', 'gemini'] as AIProvider[]) {
            const trimmed = apiKeys[p]?.trim()
            if (trimmed) {
                localStorage.setItem(STORAGE_KEYS[p], trimmed)
            } else {
                localStorage.removeItem(STORAGE_KEYS[p])
            }
        }

        setIsOpen(false)
        onSettingsChange?.()
    }

    const handleRemoveKey = () => {
        localStorage.removeItem(STORAGE_KEYS[provider])
        setApiKeys((prev) => ({ ...prev, [provider]: '' }))
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="absolute top-4 right-4">
                    <Settings className="h-5 w-5" />
                    <span className="sr-only">Settings</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Configure your AI provider, API key, and audio source. Keys are stored locally in your browser.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-5 py-4">
                    {/* AI Provider */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="provider" className="text-right">
                            AI Provider
                        </Label>
                        <select
                            id="provider"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as AIProvider)}
                            className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="openai">OpenAI</option>
                            <option value="claude">Claude (Anthropic)</option>
                            <option value="gemini">Gemini (Google)</option>
                        </select>
                    </div>

                    {/* API Key for selected provider */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="api-key" className="text-right">
                            {PROVIDER_LABELS[provider]} Key
                        </Label>
                        <Input
                            id="api-key"
                            type="password"
                            value={apiKeys[provider]}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                            }
                            className="col-span-3"
                            placeholder={PROVIDER_PLACEHOLDERS[provider]}
                        />
                    </div>

                    {/* Audio Source */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="audio-source" className="text-right">
                            Audio Source
                        </Label>
                        <select
                            id="audio-source"
                            value={audioSource}
                            onChange={(e) => setAudioSource(e.target.value as AudioSource)}
                            className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="mic">Microphone Only</option>
                            <option value="system">System Audio Only (screen share)</option>
                            <option value="both">Microphone + System Audio</option>
                        </select>
                    </div>

                    {audioSource !== 'mic' && (
                        <p className="text-xs text-muted-foreground col-span-4 text-center">
                            System audio requires screen/tab sharing. Check &quot;Share audio&quot; in the browser dialog.
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="destructive" onClick={handleRemoveKey} className="mr-auto">
                        Remove {PROVIDER_LABELS[provider]} Key
                    </Button>
                    <Button onClick={handleSave}>Save changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
