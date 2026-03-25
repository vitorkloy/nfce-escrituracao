export function Spinner({ size = 4 }: { size?: number }) {
  const px = size * 4
  return (
    <span
      className="inline-block border-2 border-current border-t-transparent rounded-full animate-spin"
      style={{ width: px, height: px }}
      aria-hidden
    />
  )
}
