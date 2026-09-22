import { useRef } from 'react'

export default function TiltCard({ as: Component = 'div', className = '', children, ...props }) {
  const ref = useRef(null)

  function handlePointerMove(event) {
    const node = ref.current
    if (!node || event.pointerType === 'touch') return
    const bounds = node.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width
    const y = (event.clientY - bounds.top) / bounds.height
    node.style.setProperty('--tilt-x', `${(0.5 - y) * 9}deg`)
    node.style.setProperty('--tilt-y', `${(x - 0.5) * 11}deg`)
    node.style.setProperty('--glow-x', `${x * 100}%`)
    node.style.setProperty('--glow-y', `${y * 100}%`)
  }

  function resetTilt() {
    const node = ref.current
    if (!node) return
    node.style.setProperty('--tilt-x', '0deg')
    node.style.setProperty('--tilt-y', '0deg')
    node.style.setProperty('--glow-x', '50%')
    node.style.setProperty('--glow-y', '50%')
  }

  return (
    <Component ref={ref} className={`tilt-surface ${className}`.trim()}
      onPointerMove={handlePointerMove} onPointerLeave={resetTilt} onBlur={resetTilt} {...props}>
      {children}
    </Component>
  )
}
