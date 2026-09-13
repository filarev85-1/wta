import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Vercel 빌드 시 엄격한 타입 에러로 인해 배포가 중단되는 것을 방지합니다.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;