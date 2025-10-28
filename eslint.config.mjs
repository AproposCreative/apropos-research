import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  js.configs.recommended,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      '*.config.js',
      'scripts/**',
      'ui/.next/**',
      'ui/node_modules/**',
      'ui/public/**',
      'ui/*.config.js',
      'ui/scripts/**'
    ]
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        FileReader: 'readonly',
        XMLHttpRequest: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        console: 'readonly',
        location: 'readonly',
        history: 'readonly',
        performance: 'readonly',
        Image: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLImageElement: 'readonly',
        Node: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MessageEvent: 'readonly',
        React: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLButtonElement: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        File: 'readonly',
        NodeJS: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
      'no-empty': 'off',
      'no-case-declarations': 'off',
      'no-empty-pattern': 'off',
      'no-useless-escape': 'off',
      'no-undef': 'off',
      'react-hooks/exhaustive-deps': 'off',
      '@next/next/no-img-element': 'off'
    }
  },
  {
    rules: {
      'no-unused-vars': 'off',
      'no-console': 'off'
    }
  }
];
