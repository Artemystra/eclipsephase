module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/test/setup/foundry-mock.js"],
  testMatch: ["<rootDir>/test/**/*.test.js"],
  moduleFileExtensions: ["js", "mjs", "json"],
  transform: {
    "^.+\\.m?js$": "babel-jest"
  }
};
