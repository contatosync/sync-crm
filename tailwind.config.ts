import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./pages/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#1A1A2E',
        primary: '#2563EB',
        'primary-dark': '#1D4ED8',
        whatsapp: '#25D366',
        success: '#00C853',
        warning: '#FFB300',
        danger: '#F44336',
        surface: '#F4F5F7',
        border: '#E5E7EB',
      },
    },
  },
  plugins: [],
}
export default config
