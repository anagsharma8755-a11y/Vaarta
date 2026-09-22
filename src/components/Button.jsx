export default function Button({
  children,
  variant = 'primary',
  as: Component = 'button',
  className = '',
  ...props
}) {
  return (
    <Component type={Component === 'button' ? 'button' : undefined} className={`btn btn--${variant} ${className}`.trim()} {...props}>
      {children}
    </Component>
  )
}
