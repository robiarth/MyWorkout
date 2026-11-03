module.exports = {
  preset: "jest-expo",
  testMatch: ["**/tests/**/*.test.[tj]s?(x)"],
  collectCoverageFrom: ["src/domain.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
};
