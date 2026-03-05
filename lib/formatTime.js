// lib/formatTime.js

/**
 * Format elapsed milliseconds into MM:SS.d  (e.g. 08:42.3)
 */
export function formatMs(ms) {
  if (ms == null || ms < 0) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenths  = Math.floor((ms % 1000) / 100)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
}
