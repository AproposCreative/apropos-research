import nextConfig from 'eslint-config-next/core-web-vitals';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...nextConfig,
  {
    ignores: ['public/**', 'scripts/**', '*.config.js'],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
      'no-empty': 'off',
      'no-case-declarations': 'off',
      'no-empty-pattern': 'off',
      'no-useless-escape': 'off',
      'react-hooks/exhaustive-deps': 'off',
      // v7+ extras are very strict; keep hooks-of-hooks only until refactors.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react/no-unescaped-entities': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
  {
    files: ['test/**'],
    rules: {
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-empty': 'off',
    },
  },
  {
    files: ['eslint.config.mjs'],
    rules: {
      'import/no-anonymous-default-export': 'off',
    },
  },
];

export default eslintConfig;
