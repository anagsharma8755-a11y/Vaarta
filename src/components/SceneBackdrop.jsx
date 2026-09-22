export default function SceneBackdrop({ variant = 'default' }) {
  return (
    <div className={`scene-backdrop scene-backdrop--${variant}`} aria-hidden="true">
      <div className="scene-backdrop__aurora scene-backdrop__aurora--one" />
      <div className="scene-backdrop__aurora scene-backdrop__aurora--two" />
      <div className="scene-backdrop__grid" />
      <div className="scene-backdrop__orb scene-backdrop__orb--one" />
      <div className="scene-backdrop__orb scene-backdrop__orb--two" />
    </div>
  )
}
