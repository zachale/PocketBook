import React, { useCallback, useRef, useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
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

function EntryEditor({
  entry,
  onNewBubble,
  onDeleteBubble,
  onEmptyChange,
  onTextChange,
  onFocusChange,
  autoFocus,
}: {
  entry: Entry
  onNewBubble: () => void
  onDeleteBubble?: () => void
  onEmptyChange?: (empty: boolean) => void
  onTextChange?: (text: string) => void
  onFocusChange?: (focused: boolean) => void
  autoFocus: boolean
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
  const [liveText, setLiveText] = useState(entry.content)
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([])
  const [isFocused, setIsFocused] = useState(false)
  // Generation counter: bumped on every fire so stale in-flight responses from
  // earlier requests can't overwrite a newer result.
  const suggestGenRef = useRef(0)

  const handleFocusChange = useCallback((focused: boolean) => {
    setIsFocused(focused)
  }, [])

  // Hydrate persisted suggestions on mount so they survive blur and reload
  // without redoing the LLM work.
  useEffect(() => {
    let cancelled = false
    window.api.tags.getSuggestions(entry.id)
      .then(saved => { if (!cancelled && saved.length > 0) setSuggestions(saved) })
      .catch(err => console.warn('[Bubble] getSuggestions failed', err))
    return () => { cancelled = true }
  }, [entry.id])

  useSuggestionTrigger({
    content: liveText,
    enabled: aiReady && isFocused,
    onTrigger: async (text) => {
      const myGen = ++suggestGenRef.current
      try {
        const r = await window.api.tags.suggest(entry.id, text)
        if (suggestGenRef.current !== myGen) return
        setSuggestions(r)
      } catch (err) {
        if (suggestGenRef.current !== myGen) return
        console.warn('[Bubble] suggest failed', err)
      }
    },
  })

  return (
    <div
      data-entry-id={entry.id}
      className={`bubble${fresh ? ' fresh' : ''}`}
    >
      <EntryEditor
        entry={entry}
        onNewBubble={onNewBubble}
        onDeleteBubble={onDeleteBubble}
        onEmptyChange={onEmptyChange}
        onTextChange={setLiveText}
        onFocusChange={handleFocusChange}
        autoFocus={autoFocus}
      />
      <TagBar entryId={entry.id} suggestions={suggestions} />
    </div>
  )
}
