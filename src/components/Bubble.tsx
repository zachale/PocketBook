import React, { useCallback, useRef, useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Entry } from '../shared/types'

interface Props {
  entry: Entry
  onNewBubble: () => void
  onDeleteBubble?: () => void
  onEmptyChange?: (empty: boolean) => void
  autoFocus?: boolean
  fresh?: boolean
  /**
   * Pre-rendered, already-sanitized HTML. When supplied, the bubble uses this
   * for its inactive (non-editor) view and skips marked.parse + sanitize on
   * mount — eliminating the flash of raw markdown during initial paint.
   */
  prerenderedHTML?: string
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
  autoFocus,
  onHTMLChange,
}: {
  entry: Entry
  onNewBubble: () => void
  onDeleteBubble?: () => void
  onEmptyChange?: (empty: boolean) => void
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

  return <EditorContent editor={editor} />
}

export function Bubble({ entry, onNewBubble, onDeleteBubble, onEmptyChange, autoFocus = false, fresh = false, prerenderedHTML }: Props) {
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(autoFocus)
  // Prefer pre-rendered HTML (already sanitized upstream). Fall back to
  // parsing on mount only when the parent didn't pre-render.
  const prerenderedRef = useRef(prerenderedHTML)
  const [cachedHTML, setCachedHTML] = useState(() => {
    if (prerenderedHTML !== undefined) return prerenderedHTML
    return entry.content ? (marked.parse(entry.content) as string) : ''
  })

  // If the parent supplies pre-rendered HTML after mount (e.g. lazy load
  // resolved), adopt it.
  useEffect(() => {
    if (prerenderedHTML !== undefined && prerenderedHTML !== prerenderedRef.current) {
      prerenderedRef.current = prerenderedHTML
      setCachedHTML(prerenderedHTML)
    }
  }, [prerenderedHTML])

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
          autoFocus={autoFocus}
          onHTMLChange={setCachedHTML}
        />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cachedHTML) }} />
      )}
    </div>
  )
}
