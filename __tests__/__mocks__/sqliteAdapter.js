// Replaces the native SQLite adapter with WatermelonDB's in-memory LokiJS adapter
// so service-layer tests can run in Node.js without a device or simulator.
const LokiJSAdapter = require('@nozbe/watermelondb/adapters/lokijs').default;

class TestAdapter extends LokiJSAdapter {
  constructor(options) {
    // LokiJS doesn't use jsi or onSetUpError — pass only the common options.
    super({
      schema: options.schema,
      migrations: options.migrations,
      useWebWorker: false,
      useIncrementalIndexedDB: false,
    });
  }
}

module.exports = { default: TestAdapter, __esModule: true };
