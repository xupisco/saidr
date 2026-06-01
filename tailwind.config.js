import daisyui from 'daisyui';

export default {
  content: ['./index.html', './src/**/*.{svelte,ts}'],
  theme: {
    extend: {}
  },
  plugins: [daisyui],
  daisyui: {
    themes: ['saidr', 'light', 'dark', 'business', 'corporate', 'dracula']
  }
};
