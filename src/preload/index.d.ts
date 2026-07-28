import type { GraphiteApi } from '../shared/types'

declare global {
  interface Window {
    api: GraphiteApi
    onMenuCommand: (listener: (command: string) => void) => () => void
  }
}

export {}
