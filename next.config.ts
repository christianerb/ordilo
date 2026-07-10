import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tree-shake barrel-export icon libraries so only used icons are bundled
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
