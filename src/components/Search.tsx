import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { SearchResult } from '../shared/types'

interface Props {
  onClose: () => void
  onSelectResult: (date: string, entryId: number) => void
}

function SnippetText({ html }: { html: string }) {
  const parts = html.split(/(<mark>.*?<\/mark>)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('<mark>') && part.endsWith('</mark>')) {
          return <mark key={i}>{part.slice(6, -7)}</mark>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function Search({ onClose, onSelectResult }: Props) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedTerm = useDebounce(term, 300)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!debouncedTerm.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    let cancelled = false
    window.api.searchEntries(debouncedTerm)
      .then(r => {
        if (!cancelled) {
          setResults(r)
          setSearched(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResults([])
          setSearched(true)
        }
      })
    return () => { cancelled = true }
  }, [debouncedTerm])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() },
    [onClose]
  )

  return (
    <div className="search-overlay" onClick={handleOverlayClick}>
      <div className="search-panel">
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search entries..."
          value={term}
          onChange={e => setTerm(e.target.value)}
        />
        <div className="search-results">
          {searched && results.length === 0 && (
            <div className="search-empty">No entries found for "{term}"</div>
          )}
          {results.map(result => (
            <div
              key={result.entryId}
              className="search-result"
              onClick={() => onSelectResult(result.date, result.entryId)}
            >
              <div className="search-result-date">
                {new Date(result.date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </div>
              <div className="search-result-snippet">
                <SnippetText html={result.snippet} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
