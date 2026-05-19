/** Root ESLint config for the avihay-books monorepo (mobile + backend + shared). */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
    project: ["./mobile/tsconfig.json", "./backend/tsconfig.json", "./shared/tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
    es2022: true,
  },
  plugins: ["@typescript-eslint", "react", "react-hooks", "react-native"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  settings: {
    react: { version: "detect" },
  },
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/consistent-type-imports": "warn",
    "@typescript-eslint/no-explicit-any": "off",
    "no-empty": ["warn", { allowEmptyCatch: true }],
    "react-native/no-unused-styles": "warn",
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "build/",
    "**/dist/",
    "**/build/",
    "**/*.d.ts",
    "**/.expo/",
    "**/.expo-shared/",
    "**/dist-web-test/",
  ],
  overrides: [
    {
      files: ["mobile/**/*.{ts,tsx}"],
      env: { browser: true },
      rules: {
        "react-native/no-color-literals": "off",
      },
    },
    {
      files: ["backend/**/*.ts", "shared/**/*.ts", "database/**/*.ts", "seed/**/*.ts"],
      rules: {
        "react/react-in-jsx-scope": "off",
      },
    },
    {
      files: ["**/*.cjs", "**/*.js"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
      },
    },
  ],
};
