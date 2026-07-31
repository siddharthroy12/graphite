import { useEffect, useState } from 'react'
import type { DataLocation, ThemePreference } from '@shared/types'
import { FolderOpen } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useWorkspace } from '@/lib/workspace'

interface SettingsDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
}

export function SettingsDialog({
  open,
  onOpenChange
}: SettingsDialogProps): React.JSX.Element {
  const { theme, setTheme } = useWorkspace()
  const [location, setLocation] = useState<DataLocation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) void window.api.system.dataInfo().then(setLocation)
  }, [open])

  // A successful relocation reopens the database at the new spot in the main
  // process; reloading gives the renderer a clean slate reading from there.
  const relocate = async (run: () => Promise<DataLocation | null>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const next = await run()
      if (next) window.location.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move your data.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Graphite runs entirely on this machine. Nothing is sent anywhere.
          </DialogDescription>
        </DialogHeader>

        {/* `min-w-0` matters: DialogContent is a grid, and a grid item defaults
            to `min-width: auto`, so the long data path below would widen the
            track past the dialog instead of being truncated. */}
        <div className="min-w-0 space-y-4 py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="theme-select">Appearance</Label>
              <p className="text-sm text-muted-foreground">
                Follow the system or pick a fixed theme.
              </p>
            </div>
            <Select
              value={theme}
              onValueChange={(value) => setTheme(value as ThemePreference)}
            >
              <SelectTrigger id="theme-select" className="w-36 flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Data location</Label>
            <p className="text-sm text-muted-foreground">
              Your pages and uploaded images live in this folder. Move it to an
              external drive or a synced folder, and the app carries your data
              across.
            </p>
            <div className="flex items-center gap-2">
              {/* `dir="rtl"` puts the ellipsis at the *start*, keeping the
                  folder name visible. The inner `bdi` isolates the path so its
                  leading "/" isn't reordered to the end when it does fit. */}
              <code
                dir="rtl"
                title={location?.dir}
                className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-left text-xs"
              >
                <bdi dir="ltr">{location?.dir ?? 'Loading…'}</bdi>
              </code>
              <Button
                variant="outline"
                size="sm"
                className="flex-none"
                disabled={busy}
                onClick={() => void window.api.system.revealData()}
              >
                <FolderOpen className="size-4" />
                Reveal
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void relocate(() => window.api.system.chooseDataLocation())}
              >
                {busy ? 'Moving…' : 'Change location…'}
              </Button>
              {location && !location.isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void relocate(() => window.api.system.resetDataLocation())}
                >
                  Reset to default
                </Button>
              )}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
