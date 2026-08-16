import { useEffect, useState } from 'react'

/** PROTOTYPE — ticking countdown for resend cooldowns and Retry-After text. */
export function useCountdown(from: number) {
  const [left, setLeft] = useState(from)
  useEffect(() => {
    setLeft(from)
    const id = setInterval(() => setLeft((n) => (n <= 0 ? 0 : n - 1)), 1000)
    return () => clearInterval(id)
  }, [from])
  return [left, () => setLeft(from)] as const
}
