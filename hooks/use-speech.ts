'use client'

// Browser speech: Web Speech API recognition (speech → text) and speechSynthesis (text → speech).
// Recognition works in Chrome, Edge and Safari, but it streams audio to the browser vendor's service, which
// fails in browsers without access to it (Brave, Chromium, embedded previews) or behind some networks. In
// that case, and in browsers with no recognition at all, we record the audio and transcribe it on our server.

import { useCallback, useEffect, useRef, useState } from 'react'

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed':
    'Haven needs permission to use the microphone. Click the microphone icon in the address bar to allow it, or type instead.',
  'service-not-allowed':
    "Voice isn't allowed in this browser. On a Mac, Safari also needs Dictation turned on. You can type instead.",
  'audio-capture':
    "I can't find a microphone. Check that one is connected and that your browser is allowed to use it in your computer's privacy settings.",
  'no-speech': "I didn't hear anything. Tap the microphone and try again.",
  network: "Voice needs an internet connection to the browser's speech service. Please try again or type instead.",
}

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// Errors that mean the browser's recognition service won't work here, so recording is used instead.
const FALLBACK_ERRORS = new Set(['network', 'service-not-allowed', 'language-not-supported'])

const SILENCE_LEVEL = 0.02 // RMS below this counts as quiet
const END_AFTER_SILENCE_MS = 1500 // stop once the senior pauses this long after speaking
const GIVE_UP_MS = 8000 // stop if nothing is said at all
const MAX_RECORDING_MS = 30_000

function canRecord(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return SPEECH_ERRORS['not-allowed']
  if (name === 'NotFoundError' || name === 'NotReadableError') return SPEECH_ERRORS['audio-capture']
  return "Voice didn't work just now. Please try again or type instead."
}

export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const recorder = useRef<{ stop: () => void; cancel: () => void } | null>(null)
  const useRecorder = useRef(false)
  const finalText = useRef('')
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  useEffect(() => {
    useRecorder.current = getRecognitionCtor() === null
    setSupported(getRecognitionCtor() !== null || canRecord())
  }, [])

  const startRecording = useCallback(async () => {
    if (!canRecord()) {
      setError("Voice isn't available in this browser. Please type instead.")
      return
    }
    setError(null)
    setInterim('')
    setListening(true)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      console.warn('[Haven speech] microphone error:', err)
      setListening(false)
      setError(micErrorMessage(err))
      return
    }

    const media = new MediaRecorder(stream)
    const chunks: Blob[] = []
    const audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    audioCtx.createMediaStreamSource(stream).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)

    let heardSpeech = false
    let cancelled = false
    const startedAt = Date.now()
    let lastSound = startedAt
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const v of samples) sum += v * v
      const now = Date.now()
      if (Math.sqrt(sum / samples.length) > SILENCE_LEVEL) {
        heardSpeech = true
        lastSound = now
      }
      if (
        (heardSpeech && now - lastSound > END_AFTER_SILENCE_MS) ||
        (!heardSpeech && now - startedAt > GIVE_UP_MS) ||
        now - startedAt > MAX_RECORDING_MS
      ) {
        stop()
      }
    }, 100)

    const release = () => {
      clearInterval(timer)
      stream.getTracks().forEach((t) => t.stop())
      void audioCtx.close().catch(() => {})
      recorder.current = null
    }
    function stop() {
      if (media.state !== 'inactive') media.stop()
    }

    media.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    media.onstop = async () => {
      release()
      setListening(false)
      if (cancelled) return
      if (!heardSpeech || !chunks.length) {
        setError(SPEECH_ERRORS['no-speech'])
        return
      }
      setTranscribing(true)
      try {
        const type = media.mimeType || chunks[0].type || 'audio/webm'
        const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm'
        const body = new FormData()
        body.append('audio', new Blob(chunks, { type }), `speech.${ext}`)
        const res = await fetch('/api/senior/transcribe', { method: 'POST', body })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const { text } = (await res.json()) as { text: string }
        if (text.trim()) onFinalRef.current(text.trim())
        else setError(SPEECH_ERRORS['no-speech'])
      } catch (err) {
        console.warn('[Haven speech] transcription failed:', err)
        setError("Voice didn't work just now. Please try again or type instead.")
      } finally {
        setTranscribing(false)
      }
    }

    recorder.current = {
      stop,
      cancel: () => {
        cancelled = true
        stop()
      },
    }
    media.start()
  }, [])

  const start = useCallback(() => {
    stopSpeaking()
    const Ctor = getRecognitionCtor()
    if (!Ctor || useRecorder.current) {
      void startRecording()
      return
    }
    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false // stop after the senior pauses
    finalText.current = ''
    setInterim('')
    setError(null)

    rec.onresult = (e) => {
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText.current += r[0].transcript
        else pending += r[0].transcript
      }
      setInterim((finalText.current + pending).trim())
    }
    let errored = false
    let switchToRecorder = false
    rec.onerror = (e) => {
      console.warn('[Haven speech] recognition error:', e.error)
      if (e.error === 'aborted') return
      errored = true
      if (FALLBACK_ERRORS.has(e.error) && canRecord()) {
        // The browser's speech service is unreachable; record and transcribe on our server from now on.
        useRecorder.current = true
        switchToRecorder = true
        return
      }
      setError(SPEECH_ERRORS[e.error] ?? "Voice didn't work just now. Please try again or type instead.")
    }
    rec.onend = () => {
      recognition.current = null
      const text = finalText.current.trim()
      setInterim('')
      if (switchToRecorder) {
        void startRecording()
        return
      }
      setListening(false)
      if (text) onFinalRef.current(text)
      else if (!errored) setError("I didn't hear anything. Tap the microphone and try again.")
    }
    recognition.current = rec
    setListening(true)
    rec.start()
  }, [startRecording])

  const stop = useCallback(() => {
    recognition.current?.stop()
    recorder.current?.stop()
  }, [])

  useEffect(
    () => () => {
      recognition.current?.abort()
      recorder.current?.cancel()
    },
    [],
  )

  return { supported, listening, transcribing, interim, error, start, stop }
}

export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.92 // a little slower, easier to follow
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}
