import React from 'react'

interface Props {
  onSearch: () => void
}

export function Titlebar({ onSearch }: Props) {
  return (
    <div className="titlebar">
      <div className="titlebar-title">PocketBook</div>
      <button
        type="button"
        className="titlebar-search-chip"
        onClick={onSearch}
        title="Search (⌘F)"
        aria-label="Search"
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9.4 9.4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>⌘F</span>
      </button>
    </div>
  )
}
