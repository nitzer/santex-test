/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Pending Actions API. Defaults to http://localhost:8000 when unset. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
