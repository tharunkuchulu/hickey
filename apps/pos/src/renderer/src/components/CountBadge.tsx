/** Phone-style red count bubble on a top-bar icon; renders nothing at 0. */
export function CountBadge({ n, testId }: { n: number; testId?: string }) {
  if (n <= 0) return null
  return (
    <span
      data-testid={testId}
      className="absolute -top-0.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold leading-[18px] text-center ring-2 ring-white"
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}
