// global.d.ts

interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    maxAlternatives: number
    onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null
    onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null
    onend: ((this: SpeechRecognition, ev: Event) => any) | null
    onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any)
    | null
    onnomatch:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any)
    | null
    onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any)
    | null
    onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null
    onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null
    onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null
    onstart: ((this: SpeechRecognition, ev: Event) => any) | null
    serviceURI: string
    abort(): void
    start(): void
    stop(): void
}

declare var SpeechRecognition: {
    prototype: SpeechRecognition
    new(): SpeechRecognition
}

interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number
    readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
    readonly error:
    | 'no-speech'
    | 'aborted'
    | 'audio-capture'
    | 'network'
    | 'not-allowed'
    | 'service-not-allowed'
    | 'bad-grammar'
    | 'language-not-supported'
    readonly message: string
}

interface SpeechRecognitionResultList {
    readonly length: number
    item(index: number): SpeechRecognitionResult
    [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
    readonly isFinal: boolean
    readonly length: number
    item(index: number): SpeechRecognitionAlternative
    [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
    readonly transcript: string
    readonly confidence: number
}

interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
}

declare var webkitSpeechRecognition: {
    prototype: SpeechRecognition
    new(): SpeechRecognition
}
