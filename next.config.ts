import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Vercel define VERCEL_GIT_COMMIT_SHA al construir; se muestra en el pie para saber qué versión está publicada.
    NEXT_PUBLIC_APP_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.COMMIT_REF)?.slice(0, 7) ?? "local",
  },
};

export default nextConfig;
