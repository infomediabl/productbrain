// Minimal google-ads-api stub
class GoogleAdsApi {
  constructor() {}
  Customer() {
    return {
      query: jest.fn().mockResolvedValue([]),
      campaigns: { list: jest.fn().mockResolvedValue([]) },
      report: jest.fn().mockResolvedValue([]),
    };
  }
}

module.exports = { GoogleAdsApi };
