import type { AppProps } from 'next/app'
import '@ishibashi0112/spreadsheet-grid/style.css'
import '../styles.css'

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
