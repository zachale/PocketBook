import { useEffect, useRef } from 'react'
import { countWords } from '../ai/tags/chunking'

const IDLE_MS = 3000
const WORD_THRESHOLD = 50
const MOUNT_DEBOUNCE_MS = 100

interface Args {
  content: string
  enabled: boolean
  onTrigger: (text: string) => void
}

/**
 * Fires onTrigger every 50 words OR after 3s of inactivity (whichever
 * comes first). Disabled when `enabled` is false.
 *
 * On first activation with non-empty content, fires immediately (after a small
 * debounce to avoid flurries on the same render). Subsequent fires occur when
 * either 50 new words are typed OR 3s of inactivity elapses.
 */
export function useSuggestionTrigger({ content, enabled, onTrigger }: Args) {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFiredWordsRef = useRef<number | null>(null)
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger

  useEffect(() => {
    if (!enabled) {
      lastFiredWordsRef.current = null
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      if (mountTimerRef.current) clearTimeout(mountTimerRef.current)
      return
    }

    const words = countWords(content)

    // Don't fire on empty content
    if (words === 0) {
      return
    }

    // First time the hook sees this content while enabled — fire immediately
    // (with small debounce), then seed the word count for delta-based fires
    if (lastFiredWordsRef.current === null) {
      if (mountTimerRef.current) clearTimeout(mountTimerRef.current)
      mountTimerRef.current = setTimeout(() => {
        lastFiredWordsRef.current = words
        onTriggerRef.current(content)
      }, MOUNT_DEBOUNCE_MS)
      return
    }

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)

    const fire = () => {
      lastFiredWordsRef.current = words
      onTriggerRef.current(content)
    }

    if (words - lastFiredWordsRef.current >= WORD_THRESHOLD) {
      fire()
      return
    }

    idleTimerRef.current = setTimeout(fire, IDLE_MS)
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [content, enabled])
}
