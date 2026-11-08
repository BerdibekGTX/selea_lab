import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  distDir: process.env.SELEA_DIST_DIR || (process.env.NODE_ENV === "production" ? ".next-build" : ".next"),
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.SELEA_API_URL || "http://127.0.0.1:8000"}/api/:path*` }];
  },
};
export default nextConfig;
