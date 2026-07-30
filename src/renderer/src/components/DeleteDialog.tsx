import type { PageTreeNode } from '@shared/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { displayTitle, flattenTree } from '@/lib/tree'
import { TRASH_RETENTION_DAYS } from '@shared/trash'

interface DeleteDialogProps {
  node: PageTreeNode | null
  onCancel(): void
  onConfirm(id: string): void
}

export function DeleteDialog({
  node,
  onCancel,
  onConfirm
}: DeleteDialogProps): React.JSX.Element {
  // Trashing a parent takes its whole subtree, so say so explicitly.
  const descendants = node ? flattenTree(node.children).length : 0

  return (
    <Dialog open={node !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* A long unbroken page title would otherwise widen the dialog's
              grid track past its max-width. */}
          <DialogTitle className="min-w-0 [overflow-wrap:anywhere]">
            Move “{node ? displayTitle(node.title) : ''}” to trash?
          </DialogTitle>
          <DialogDescription>
            {descendants > 0
              ? `This also moves ${descendants} nested ${
                  descendants === 1 ? 'page' : 'pages'
                } to trash. `
              : ''}
            Pages in trash are deleted for good after {TRASH_RETENTION_DAYS} days, or you can
            remove them sooner from there.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => node && onConfirm(node.id)}
          >
            Move to trash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
