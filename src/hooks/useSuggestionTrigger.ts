import { useEffect, useRef } from 'react'
import { countWords } from '../ai/tags/chunking'

const IDLE_MS = 3000
const WORD_THRESHOLD = 50

interface Args {
  content: string
  enabled: boolean
  onTrigger: (text: string) => void
}

/**
 * Fires onTrigger every 50 words OR after 3s of inactivity (whichever
 * comes first). Disabled when `enabled` is false.
 *
 * We track the word count at *first activation* and only count new words
 * from there — so static bubbles loaded with prior content don't fire on
 * mount. Only the user's typing-in-progress changes trigger refreshes.
 */
export function useSuggestionTrigger({ content, enabled, onTrigger }: Args) {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFiredWordsRef = useRef<number | null>(null)
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger

  useEffect(() => {
    if (!enabled) {
      lastFiredWordsRef.current = null
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      return
    }

    const words = countWords(content)

    // First time the hook sees this content while enabled — bank the count
    // and don't fire. Stops static bubbles from suggesting on mount.
    if (lastFiredWordsRef.current === null) {
      lastFiredWordsRef.current = words
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
