import rekaTooling from '@reka/tooling/eslint'

export default [
  ...rekaTooling,
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
]
