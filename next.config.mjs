/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/file'

// In dev, the browser calls /file/api/* on the Next server.
// Next proxies those to Django so there's zero cross-origin friction.
// In production, nginx routes /file/api/ directly to Django — this block has no effect.
const djangoOrigin = process.env.DJANGO_ORIGIN || 'http://127.0.0.1:8000'

const nextConfig = {
  basePath,
  assetPrefix: basePath,
  trailingSlash: false,
  // Allow the production hostname to connect during dev mode (suppresses cross-origin warning)
  allowedDevOrigins: ['https://apps.easthartfordct.gov'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Exclude native Node modules from webpack bundling
  serverExternalPackages: ['@napi-rs/canvas', 'canvas', 'tesseract.js', 'pdfjs-dist'],
}

export default nextConfig
