import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
    transpilePackages: ["@majimap/shared-types", "@majimap/network", "@majimap/api", "@majimap/db"],
};

export default nextConfig;
