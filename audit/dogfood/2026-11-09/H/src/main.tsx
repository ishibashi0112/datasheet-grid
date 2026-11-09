import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import '@ishibashi0112/spreadsheet-grid/style.css'
import '@ishibashi0112/spreadsheet-grid/themes/mantine.css'
import { App } from './App'

const theme = new URLSearchParams(location.search).has('teal')
  ? createTheme({ primaryColor: 'teal', defaultRadius: 'xl' })
  : undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="light" theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>,
)
