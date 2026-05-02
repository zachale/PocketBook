import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Bubble } from '../../src/components/Bubble'
import type { Entry } from '../../src/shared/types'

const mockEntry: Entry = {
  id: 1,
  date: '2026-05-01',
  position: 0,
  content: '',
  created_at: Date.now(),
  updated_at: Date.now(),
}

beforeEach(() => {
  window.api = {
    getEntriesForDates: vi.fn(),
    upsertEntry: vi.fn().mockResolvedValue({ ...mockEntry, id: 1 }),
    deleteEntry: vi.fn(),
    getTimelineIndex: vi.fn(),
    searchEntries: vi.fn(),
  }
})

describe('Bubble', () => {
  it('renders placeholder text when content is empty', () => {
    render(<Bubble entry={mockEntry} onNewBubble={vi.fn()} />)
    expect(screen.getByText(/start writing/i)).toBeInTheDocument()
  })

  it('renders existing content', () => {
    const entry = { ...mockEntry, content: 'Hello world' }
    render(<Bubble entry={entry} onNewBubble={vi.fn()} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('calls upsertEntry after typing (debounced)', async () => {
    vi.useFakeTimers()
    render(<Bubble entry={mockEntry} onNewBubble={vi.fn()} autoFocus={true} />)
    const editor = screen.getByRole('textbox')
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) }).type(editor, 'Hello')
    vi.advanceTimersByTime(600)
    await waitFor(() => {
      expect(window.api.upsertEntry).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Hello') })
      )
    })
    vi.useRealTimers()
  })

})
