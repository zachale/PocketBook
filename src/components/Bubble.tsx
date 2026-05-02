import React, { useCallback, useRef, useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { Extension } from '@tiptap/core'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Entry } from '../shared/types'

interface Props {
  entry: Entry
  onNewBubble: () => void
  autoFocus?: boolean
}

function NewBubbleExtension(onNewBubble: () => void) {
  return Extension.create({
    name: 'newBubble',
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          const { state } = this.editor
          const { $from } = state.selection
          const isEmptyParagraph =
            $from.parent.type.name === 'paragraph' &&
            $from.parent.content.size === 0
          const isAtDocEnd =
            $from.pos === state.doc.content.size - 1

          if (isEmptyParagraph && isAtDocEnd) {
            this.editor.commands.deleteCurrentNode()
            onNewBubble()
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
  autoFocus,
  onHTMLChange,
  onEmptyChange,
}: {
  entry: Entry
  onNewBubble: () => void
  autoFocus: boolean
  onHTMLChange: (html: string) => void
  onEmptyChange: (empty: boolean) => void
}) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const entryRef = useRef(entry)
  entryRef.current = entry

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
    extensions: [StarterKit, Markdown, NewBubbleExtension(onNewBubble)],
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
      onEmptyChange(editor.isEmpty)
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

export function Bubble({ entry, onNewBubble, autoFocus = false }: Props) {
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(autoFocus)
  const [editorEmpty, setEditorEmpty] = useState(!entry.content || entry.content.trim() === '')
  const [cachedHTML, setCachedHTML] = useState(() =>
    entry.content ? (marked.parse(entry.content) as string) : ''
  )

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

  const isEmpty = !entry.content || entry.content.trim() === ''

  return (
    <div
      ref={bubbleRef}
      className={`bubble${isEmpty ? ' empty' : ''}`}
      onClick={() => setIsVisible(true)}
    >
      {isVisible ? (
        <>
          {editorEmpty && (
            <span className="bubble-placeholder" aria-hidden="true">
              Start writing...
            </span>
          )}
          <ActiveEditor
            entry={entry}
            onNewBubble={onNewBubble}
            autoFocus={autoFocus}
            onHTMLChange={setCachedHTML}
            onEmptyChange={setEditorEmpty}
          />
        </>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cachedHTML) }} />
      )}
    </div>
  )
}
