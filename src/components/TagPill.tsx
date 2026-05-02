import React from 'react'

interface BaseProps {
  variant: 'added' | 'suggested'
  name: string
  aiGenerated?: boolean
  title?: string
}

interface AddedProps extends BaseProps {
  variant: 'added'
  onRemove: () => void
}

interface SuggestedProps extends BaseProps {
  variant: 'suggested'
  onClick: () => void
}

type Props = AddedProps | SuggestedProps

export function TagPill(props: Props) {
  const { variant, name, aiGenerated, title } = props
  const className = `tag-pill ${variant}${aiGenerated ? ' ai' : ''}`

  if (variant === 'added') {
    return (
      <span className={className} title={title}>
        {aiGenerated && <span className="tag-pill-glyph" aria-hidden="true">✦</span>}
        <span className="tag-pill-name">{name}</span>
        <button
          type="button"
          className="tag-pill-remove"
          onClick={(props as AddedProps).onRemove}
          aria-label={`Remove ${name}`}
        >
          ×
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      className={className}
      onClick={(props as SuggestedProps).onClick}
      title={title}
    >
      {aiGenerated && <span className="tag-pill-glyph" aria-hidden="true">✦</span>}
      <span className="tag-pill-name">{name}</span>
    </button>
  )
}
