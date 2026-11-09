import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri/target', 'src-tauri/gen', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict, prettier],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Netzwerk-APIs sind in der App verboten (Offline-Vorgabe).
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Kein Netzwerkzugriff: fetch ist verboten.' },
        { name: 'XMLHttpRequest', message: 'Kein Netzwerkzugriff.' },
        { name: 'WebSocket', message: 'Kein Netzwerkzugriff.' },
        { name: 'EventSource', message: 'Kein Netzwerkzugriff.' },
      ],
    },
  },
  {
    // In Tests sind knappe Annahmen (!) und leere Attrappen-Klassen in Ordnung.
    files: ['**/*.test.{ts,tsx}', 'src/ui/testing/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    extends: [js.configs.recommended, prettier],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },
);
