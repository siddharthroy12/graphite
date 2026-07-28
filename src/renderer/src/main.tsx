import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { WorkspaceProvider } from './lib/workspace'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </StrictMode>
)
