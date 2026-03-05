// Global test setup — suppress logger output and mock heavy modules

// Mock logger globally
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  getLogPath: jest.fn(() => '/tmp/test.log'),
}));

// Suppress console output during tests
const origConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});
afterAll(() => {
  console.log = origConsole.log;
  console.warn = origConsole.warn;
  console.error = origConsole.error;
});
