/// <reference types="vite/client" />

import type { GraceApi } from './graceApi'

declare global {
  interface Window {
    graceAI?: GraceApi
  }
}

export {}
