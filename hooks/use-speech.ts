'use client'

// Browser speech: Web Speech API recognition (speech → text) and speechSynthesis (text → speech).
// Recognition works in Chrome, Edge and Safari; Firefox has no support, so callers offer typing.

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

export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const finalText = useRef('')
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  useEffect(() => setSupported(getRecognitionCtor() !== null), [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    stopSpeaking()
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
    rec.onerror = (e) => {
      console.warn('[Haven speech] recognition error:', e.error)
      if (e.error === 'aborted') return
      errored = true
      setError(SPEECH_ERRORS[e.error] ?? "Voice didn't work just now. Please try again or type instead.")
    }
    rec.onend = () => {
      setListening(false)
      recognition.current = null
      const text = finalText.current.trim()
      setInterim('')
      if (text) onFinalRef.current(text)
      else if (!errored) setError("I didn't hear anything. Tap the microphone and try again.")
    }
    recognition.current = rec
    setListening(true)
    rec.start()
  }, [])

  const stop = useCallback(() => recognition.current?.stop(), [])

  useEffect(() => () => recognition.current?.abort(), [])

  return { supported, listening, interim, error, start, stop }
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
