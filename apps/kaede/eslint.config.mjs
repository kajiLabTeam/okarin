import baseConfig from '@hono/eslint-config'
import eslintConfigPrettier from 'eslint-config-prettier'
export default [
  {
    ignores: [
      'eslint.config.mjs',
      'instrument.mjs',
      'dist/**',
      'node_modules/**',
      'src/services/db/generated.ts',
    ],
  },
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  eslintConfigPrettier,
]
