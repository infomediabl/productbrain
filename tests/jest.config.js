module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '^puppeteer$': '<rootDir>/tests/helpers/mock-puppeteer.js',
    '^puppeteer-extra$': '<rootDir>/tests/helpers/mock-puppeteer.js',
    '^puppeteer-extra-plugin-stealth$': '<rootDir>/tests/helpers/mock-puppeteer.js',
    '^tesseract\\.js$': '<rootDir>/tests/helpers/mock-tesseract.js',
    '^google-ads-api$': '<rootDir>/tests/helpers/mock-google-ads.js',
  },
  testTimeout: 10000,
};
