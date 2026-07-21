import { defineConfig } from 'orval'

export default defineConfig({
  familyhub: {
    output: {
      mode: 'split',
      target: './src/api/generated/endpoints',
      schemas: './src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      baseUrl: '/api',
      override: {
        mutator: {
          path: './src/api/customFetch.ts',
          name: 'customFetch',
        },
      },
    },
    input: {
      target: '../api/openapi.yml',
    },
  },
})
