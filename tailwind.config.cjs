/**
 * V8: Tailwind compilado localmente para o portal (index.html). Antes vinha do "Play CDN"
 * (https://cdn.tailwindcss.com), que é só para desenvolvimento e não tem verificação de integridade.
 * Gere o CSS com: npm run build:css
 *
 * Tema: é EXATAMENTE o que valia na página antes. O index.html carregava tailwind-config.js e
 * depois confirmacao-tailwind.js, e o segundo SUBSTITUÍA o primeiro por inteiro. Por isso só as
 * cores e a fonte abaixo tinham efeito; tamanhos de fonte como "text-label-md", espaçamentos como
 * "p-gutter" e várias cores do tema antigo nunca foram aplicados. Ligar o tema completo mudaria o
 * visual, então ficou de fora (pode ser feito depois, com aprovação e conferência das telas).
 */
module.exports = {
  darkMode: 'class',
  content: ['./public/index.html', './public/*.js'],
  theme: {
    extend: {
      colors: {
        primary: '#00236f',
        'primary-container': '#1e3a8a',
        'on-primary': '#ffffff',
        'primary-fixed': '#dce1ff',
        'on-primary-fixed': '#00164e',
        secondary: '#215aba',
        'secondary-container': '#6c9cff',
        'on-secondary': '#ffffff',
        'secondary-fixed': '#d9e2ff',
        'on-secondary-fixed': '#001943',
        tertiary: '#004942',
        'tertiary-container': '#00312c',
        'on-tertiary': '#ffffff',
        'tertiary-fixed': '#89f5e7',
        'tertiary-fixed-dim': '#6bd8cb',
        background: '#f8f9ff',
        surface: '#f8f9ff',
        'surface-bright': '#f8f9ff',
        'surface-dim': '#cbdbf5',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#eff4ff',
        'surface-container': '#e5eeff',
        'surface-container-high': '#dce9ff',
        'surface-container-highest': '#d3e4fe',
        'on-surface': '#0b1c30',
        'on-surface-variant': '#444651',
        outline: '#757682',
        'outline-variant': '#c5c5d3',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff'
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif']
      }
    }
  },
  // Os mesmos plugins que o index.html pedia ao CDN (?plugins=forms,container-queries)
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')]
};
