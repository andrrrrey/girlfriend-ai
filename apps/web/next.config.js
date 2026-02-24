const path = require('path');

module.exports = {
  output: 'standalone',
  experimental: {
    // Required for pnpm monorepo: traces dependencies from the monorepo root
    // so that standalone output correctly includes all shared node_modules
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:8080';
    return [
      {
        source: '/api-proxy/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};
