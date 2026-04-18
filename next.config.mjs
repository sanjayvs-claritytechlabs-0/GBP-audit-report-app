/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handlebars touches `require.extensions`; keep it external on the server bundle
    // so webpack does not parse `node_modules/handlebars/lib/index.js` (avoids warnings).
    if (isServer) {
      config.externals.push("handlebars");
    }
    return config;
  },
};

export default nextConfig;
