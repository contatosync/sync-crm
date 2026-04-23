import type { Config } from 'tailwindcss'
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sidebar: '#1C2B3A',
        accent: '#2563EB',
        whatsapp: '#25D366',
        surface: '#F5F7FA',
      },
    },
  },
  plugins: [],
}
export default config
