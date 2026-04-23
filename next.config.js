/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.whatsapp.net' },
      { protocol: 'https', hostname: 'pps.whatsapp.net' },
    ],
  },
}
module.exports = nextConfig
