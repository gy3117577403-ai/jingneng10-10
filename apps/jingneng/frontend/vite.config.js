import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  base: '/assets/jingneng/workbench/',
  build: {
    outDir: '../jingneng/public/workbench', emptyOutDir: true,
    lib: { entry: 'src/main.js', formats: ['es'], fileName: () => 'workbench.js', cssFileName: 'workbench' },
  },
})
