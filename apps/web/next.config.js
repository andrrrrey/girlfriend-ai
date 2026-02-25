const path = require('path');

module.exports = {
  output: 'standalone',
  experimental: {
    // Required for pnpm monorepo: traces dependencies from the monorepo root
    // so that standalone output correctly includes all shared node_modules
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};
