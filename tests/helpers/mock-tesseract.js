// Minimal tesseract.js stub
module.exports = {
  createWorker: jest.fn(() => ({
    load: jest.fn().mockResolvedValue(null),
    loadLanguage: jest.fn().mockResolvedValue(null),
    initialize: jest.fn().mockResolvedValue(null),
    recognize: jest.fn().mockResolvedValue({ data: { text: 'mock ocr text' } }),
    terminate: jest.fn().mockResolvedValue(null),
  })),
  createScheduler: jest.fn(() => ({
    addWorker: jest.fn(),
    addJob: jest.fn().mockResolvedValue({ data: { text: 'mock ocr text' } }),
    terminate: jest.fn().mockResolvedValue(null),
  })),
};
