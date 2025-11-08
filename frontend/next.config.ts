import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  allowedDevOrigins: [
    '*.ngrok-free.app',
    '*.ngrok.io',
  ],
};

export default nextConfig;
