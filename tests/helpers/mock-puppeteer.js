// Minimal puppeteer stub so agents that import it don't crash
const mockPage = {
  goto: jest.fn().mockResolvedValue(null),
  evaluate: jest.fn().mockResolvedValue(null),
  screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
  setViewport: jest.fn().mockResolvedValue(null),
  waitForSelector: jest.fn().mockResolvedValue(null),
  waitForNavigation: jest.fn().mockResolvedValue(null),
  content: jest.fn().mockResolvedValue('<html></html>'),
  close: jest.fn().mockResolvedValue(null),
  $: jest.fn().mockResolvedValue(null),
  $$: jest.fn().mockResolvedValue([]),
  $$eval: jest.fn().mockResolvedValue([]),
  $eval: jest.fn().mockResolvedValue(''),
  setUserAgent: jest.fn().mockResolvedValue(null),
};

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(null),
  pages: jest.fn().mockResolvedValue([mockPage]),
};

const puppeteer = {
  launch: jest.fn().mockResolvedValue(mockBrowser),
  use: jest.fn(),
  mockPage,
  mockBrowser,
};

module.exports = puppeteer;
module.exports.default = puppeteer;
