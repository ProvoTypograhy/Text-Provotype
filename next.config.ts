import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const repoBasePath = "/text-interface";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isGithubPages ? repoBasePath : undefined,
  assetPrefix: isGithubPages ? repoBasePath : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
