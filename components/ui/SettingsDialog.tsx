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

export function SettingsDialog() {
    const [apiKey, setApiKey] = useState('')
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        const storedKey = localStorage.getItem('openai_api_key')
        if (storedKey) {
            setApiKey(storedKey)
        }
    }, [])

    const handleSave = () => {
        const trimmedKey = apiKey?.trim()
        if (trimmedKey) {
            localStorage.setItem('openai_api_key', trimmedKey)
        } else {
            localStorage.removeItem('openai_api_key')
        }
        setIsOpen(false)
    }

    const handleRemove = () => {
        localStorage.removeItem('openai_api_key')
        setApiKey('')
        setIsOpen(false)
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="absolute top-4 right-4">
                    <Settings className="h-5 w-5" />
                    <span className="sr-only">Settings</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Configure your OpenAI API key here. It will be stored locally in your browser.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="api-key" className="text-right">
                            API Key
                        </Label>
                        <Input
                            id="api-key"
                            type="password"
                            value={apiKey}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                            className="col-span-3"
                            placeholder="sk-..."
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="destructive" onClick={handleRemove} className="mr-auto">
                        Remove Key
                    </Button>
                    <Button onClick={handleSave}>Save changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
