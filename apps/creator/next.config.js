/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@liveflow/design-system", "@liveflow/api-client"],
  experimental: {
    optimizePackageImports: ["@liveflow/design-system"],
  },
};

module.exports = nextConfig;
