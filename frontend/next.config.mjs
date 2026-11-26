/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_INTERNAL_URL; // e.g. http://localhost:8000 for local dev without nginx

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
  async rewrites() {
    if (!backend) return [];
    return [
      { source: "/api/:path*/", destination: `${backend}/api/:path*/` },
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
    ];
  },
};
export default nextConfig;
