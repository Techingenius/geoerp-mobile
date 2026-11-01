/**
 * Two projects, not jest-expo's bundled multi-platform preset.
 *
 * Every test runs twice, once with `Platform.OS` pinned to ios and once to
 * android, because the rule in this repo is that nothing ships verified on one
 * platform only. The suite covers `lib/api/` — guards and mappers with no
 * native surface — so today both passes assert the same thing; the point is
 * that the day one of them stops doing so, the suite says which platform.
 *
 * The `web` project is deliberately absent: the app does not ship on web.
 */
const project = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/__tests__/**/*.test.ts?(x)"],
  // Everything under __tests__/helpers is imported by a test, never is one.
  testPathIgnorePatterns: ["<rootDir>/__tests__/helpers/"],
};

module.exports = {
  projects: [
    { ...project, displayName: "ios", preset: "jest-expo/ios" },
    { ...project, displayName: "android", preset: "jest-expo/android" },
  ],
  collectCoverageFrom: ["lib/api/**/*.ts"],
};
