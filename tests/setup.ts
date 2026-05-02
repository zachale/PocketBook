import '@testing-library/jest-dom'
import { vi } from 'vitest'

// @testing-library/react checks for `jest` to detect fake timers (jestFakeTimersAreEnabled).
// Vitest doesn't inject `jest` as a global even with globals:true in some versions,
// so we alias it here so RTL can detect vi.useFakeTimers() and advance the internal
// setTimeout(0) in asyncWrapper — otherwise userEvent.type() hangs indefinitely.
if (typeof (globalThis as Record<string, unknown>).jest === 'undefined') {
  ;(globalThis as unknown as Record<string, unknown>).jest = vi
}

// jsdom does not implement IntersectionObserver — provide a stub
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  class IntersectionObserverStub {
    constructor(
      private callback: IntersectionObserverCallback,
      _options?: IntersectionObserverInit
    ) {}
    observe(target: Element) {
      // Immediately fire as intersecting so the editor mounts during tests
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      )
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return [] }
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds: ReadonlyArray<number> = []
  }
  ;(window as unknown as Record<string, unknown>).IntersectionObserver = IntersectionObserverStub
}

// jsdom does not implement getClientRects or elementFromPoint — ProseMirror
// calls these during coordsAtPos/scrollToSelection, so stub them out.
if (typeof window !== 'undefined') {
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null
  }
  const originalGetClientRects = Element.prototype.getClientRects
  if (!originalGetClientRects || originalGetClientRects.toString().includes('native code')) {
    Element.prototype.getClientRects = function () {
      return {
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      } as unknown as DOMRectList
    }
  }
  // Also stub Range.prototype.getClientRects if needed
  if (typeof Range !== 'undefined') {
    Range.prototype.getClientRects = function () {
      return {
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      } as unknown as DOMRectList
    }
    Range.prototype.getBoundingClientRect = function () {
      return new DOMRect(0, 0, 0, 0)
    }
  }
}
