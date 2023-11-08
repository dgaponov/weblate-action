module.exports = {
    root: true,
    env: {
      node: true,
      es6: true,
    },
    extends: [
      "plugin:github/recommended"
    ],
    ignorePatterns: ['dist', '.eslintrc.js'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
      "ecmaVersion": 9,
      "sourceType": "module"
    },
    plugins: ['prettier', 'import', '@typescript-eslint'],
    rules: {
      "no-console": "error",
      "prettier/prettier": "error"
    }
}
