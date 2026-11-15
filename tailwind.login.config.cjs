/**
 * V8: Tailwind compilado localmente para a tela de login da equipe (login.html).
 * Mesmo tema que estava no <script> tailwind.config da página, sem plugins (o CDN do login
 * era carregado sem ?plugins). Gere o CSS com: npm run build:css
 */
module.exports = {
  content: ['./public/login.html', './public/convocados.html', './public/convocados.js'],
  theme: {
    extend: {
      colors: {
        faeterj: {
          navy: '#0a1d37',
          blue: '#133e7c',
          lightBlue: '#1e5bb0',
          gold: '#e69a0b',
          goldDark: '#b87704',
          goldLight: '#fef3c7'
        }
      }
    }
  },
  plugins: []
};
