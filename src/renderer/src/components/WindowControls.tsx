import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ControlButtonProps {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ControlButton({ label, danger, onClick, children }: ControlButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-full w-12 flex-none items-center justify-center text-foreground/70 transition-colors',
        danger ? 'hover:bg-red-600 hover:text-white' : 'hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

/**
 * Minimize / maximize / close buttons for the frameless Windows and Linux
 * window (macOS keeps its native traffic lights). Lives at the right edge of
 * the tab bar and opts out of the window-drag region so the buttons stay
 * clickable.
 */
export function WindowControls(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.window.isMaximized().then(setMaximized)
    return window.api.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <div className="app-no-drag flex h-full flex-none items-stretch">
      <ControlButton label="Minimize" onClick={() => void window.api.window.minimize()}>
        <Minus className="size-4" />
      </ControlButton>
      <ControlButton
        label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void window.api.window.maximizeToggle()}
      >
        {maximized ? (
          <Copy className="size-3.5 -scale-x-100" />
        ) : (
          <Square className="size-3.5" />
        )}
      </ControlButton>
      <ControlButton label="Close" danger onClick={() => void window.api.window.close()}>
        <X className="size-4" />
      </ControlButton>
    </div>
  )
}
