import React, { useCallback, useRef, useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Entry } from '../shared/types'
import type { TagSuggestion } from '../shared/ai/tag-types'
import { TagBar } from './TagBar'
import { useSuggestionTrigger } from '../hooks/useSuggestionTrigger'

interface Props {
  entry: Entry
  onNewBubble: () => void
  onDeleteBubble?: () => void
  onEmptyChange?: (empty: boolean) => void
  autoFocus?: boolean
  fresh?: boolean
  aiReady?: boolean
}

interface Handlers {
  onNewBubble: () => void
  onDeleteBubble?: () => void
}

function BubbleKeysExtension(handlersRef: React.MutableRefObject<Handlers>) {
  return Extension.create({
    name: 'bubbleKeys',
    addKeyboardShortcuts() {
      return {
        'Mod-Enter': () => {
          // Refuse to spawn a new bubble when the current one is empty
          if (this.editor.isEmpty) return true
          handlersRef.current.onNewBubble()
          return true
        },
        Backspace: () => {
          if (this.editor.isEmpty && handlersRef.current.onDeleteBubble) {
            handlersRef.current.onDeleteBubble()
            return true
          }
          return false
        },
      }
    },
  })
}

// ActiveEditor is a separate component so useEditor only runs when visible
function ActiveEditor({
  entry,
  onNewBubble,
  onDeleteBubble,
  onEmptyChange,
  onTextChange,
  onFocusChange,
  autoFocus,
  onHTMLChange,
}: {
  entry: Entry
  onNewBubble: () => void
  onDeleteBubble?: () => void
  onEmptyChange?: (empty: boolean) => void
  onTextChange?: (text: string) => void
  onFocusChange?: (focused: boolean) => void
  autoFocus: boolean
  onHTMLChange: (html: string) => void
}) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const entryRef = useRef(entry)
  entryRef.current = entry

  const handlersRef = useRef<Handlers>({ onNewBubble, onDeleteBubble })
  handlersRef.current = { onNewBubble, onDeleteBubble }

  const wasEmptyRef = useRef<boolean | null>(null)

  const save = useCallback((content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.api.upsertEntry({
        id: entryRef.current.id,
        date: entryRef.current.date,
        position: entryRef.current.position,
        content,
      })
    }, 500)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      BubbleKeysExtension(handlersRef),
    ],
    content: entry.content,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        'aria-label': 'entry editor',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = (editor.storage as any).markdown.getMarkdown() as string
      save(content)
      onHTMLChange(editor.getHTML())
      onTextChange?.(content)
      const isEmpty = editor.isEmpty
      if (wasEmptyRef.current !== isEmpty) {
        wasEmptyRef.current = isEmpty
        onEmptyChange?.(isEmpty)
      }
      try {
        const { view } = editor
        const { head } = view.state.selection
        const coords = view.coordsAtPos(head)
        const scrollRoot = document.querySelector('.scroll-root') as HTMLElement
        if (scrollRoot && coords.bottom > window.innerHeight - 60) {
          scrollRoot.scrollTop += coords.bottom - window.innerHeight + 60
        }
      } catch {
        // coordsAtPos is unavailable in jsdom / headless environments
      }
    },
  })

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  useEffect(() => {
    if (!editor) return
    const handleFocus = () => onFocusChange?.(true)
    const handleBlur = () => onFocusChange?.(false)
    editor.on('focus', handleFocus)
    editor.on('blur', handleBlur)
    // Seed initial focus state (Tiptap autofocus mounts with isFocused=true)
    if (editor.isFocused) onFocusChange?.(true)
    return () => {
      editor.off('focus', handleFocus)
      editor.off('blur', handleBlur)
    }
  }, [editor, onFocusChange])

  return <EditorContent editor={editor} />
}

export function Bubble({
  entry,
  onNewBubble,
  onDeleteBubble,
  onEmptyChange,
  autoFocus = false,
  fresh = false,
  aiReady = false,
}: Props) {
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(autoFocus)
  const [cachedHTML, setCachedHTML] = useState(() =>
    entry.content ? (marked.parse(entry.content) as string) : ''
  )
  const [liveText, setLiveText] = useState(entry.content)
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([])
  const [isFocused, setIsFocused] = useState(false)
  // Generation counter: bumped on every fire and on blur. Used to drop stale
  // in-flight tags.suggest results so they don't overwrite suggestions cleared
  // at blur time, or clobber a newer request from the same bubble.
  const suggestGenRef = useRef(0)

  const handleFocusChange = useCallback((focused: boolean) => {
    setIsFocused(focused)
    if (!focused) {
      // Bump generation so any inflight request resolves into a no-op,
      // and clear stale suggestions from the bar.
      suggestGenRef.current += 1
      setSuggestions([])
    }
  }, [])

  useSuggestionTrigger({
    content: liveText,
    enabled: aiReady && isFocused,
    onTrigger: async (text) => {
      const myGen = ++suggestGenRef.current
      try {
        const r = await window.api.tags.suggest(entry.id, text)
        if (suggestGenRef.current !== myGen) return // stale; drop
        setSuggestions(r)
      } catch (err) {
        if (suggestGenRef.current !== myGen) return
        console.warn('[Bubble] suggest failed', err)
      }
    },
  })

  useEffect(() => {
    const el = bubbleRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([obs]) => setIsVisible(obs.isIntersecting),
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={bubbleRef}
      data-entry-id={entry.id}
      className={`bubble${fresh ? ' fresh' : ''}`}
      onClick={() => setIsVisible(true)}
    >
      {isVisible ? (
        <ActiveEditor
          entry={entry}
          onNewBubble={onNewBubble}
          onDeleteBubble={onDeleteBubble}
          onEmptyChange={onEmptyChange}
          onTextChange={setLiveText}
          onFocusChange={handleFocusChange}
          autoFocus={autoFocus}
          onHTMLChange={setCachedHTML}
        />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cachedHTML) }} />
      )}
      <TagBar entryId={entry.id} suggestions={suggestions} />
    </div>
  )
}
