import type { ReactNode } from "react"

type Choice<T extends string> = { value: T; label: string }
type ChoicesProps<T extends string> = {
  label: string
  options: readonly Choice<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}

export function SegmentedControl<T extends string>(props: ChoicesProps<T>) {
  return <ChoiceButtons {...props} className="selea-segmented" />
}

export function ChipGroup<T extends string>(props: ChoicesProps<T>) {
  return <ChoiceButtons {...props} className="selea-chips" />
}

function ChoiceButtons<T extends string>({
  label, options, value, onChange, disabled, className,
}: ChoicesProps<T> & { className: string }) {
  return (
    <div className={className} role="group" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" disabled={disabled}
          aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, description, children }: {
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="selea-empty">
      <span aria-hidden="true" className="selea-empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="selea-empty-actions">{children}</div>}
    </div>
  )
}

export function SuccessCheck({ children }: { children: ReactNode }) {
  return (
    <span className="selea-success">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5 5.5-5.5" pathLength="1" />
      </svg>
      {children}
    </span>
  )
}
