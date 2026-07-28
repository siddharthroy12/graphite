import { useEffect, useState } from 'react'
import type { ThemePreference } from '@shared/types'
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
  const [dataPath, setDataPath] = useState('')

  useEffect(() => {
    if (open) void window.api.system.dataPath().then(setDataPath)
  }, [open])

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
              Every page lives in a single SQLite file. Back it up by copying it.
            </p>
            <div className="flex items-center gap-2">
              {/* `dir="rtl"` puts the ellipsis at the *start*, keeping the
                  filename visible. The inner `bdi` isolates the path so its
                  leading "/" isn't reordered to the end when it does fit. */}
              <code
                dir="rtl"
                title={dataPath}
                className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-left text-xs"
              >
                <bdi dir="ltr">{dataPath || 'Loading…'}</bdi>
              </code>
              <Button
                variant="outline"
                size="sm"
                className="flex-none"
                onClick={() => void window.api.system.revealData()}
              >
                <FolderOpen className="size-4" />
                Reveal
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
