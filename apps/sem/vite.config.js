import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

function pdfAssets() {
    const files=new Map();
    for(const dir of ['cmaps','standard_fonts','wasm','iccs']){
        const root=new URL(`./node_modules/pdfjs-dist/${dir}/`,import.meta.url);
        for(const file of readdirSync(root))files.set(`pdfjs/${dir}/${file}`,fileURLToPath(new URL(file,root)));
    }
    return {name:'jn-private-pdf-assets',
        generateBundle(){for(const [fileName,path] of files)this.emitFile({type:'asset',fileName,source:readFileSync(path)});},
        configureServer(server){server.middlewares.use((request,response,next)=>{const path=files.get((request.url||'').split('?')[0].replace(/^\//,''));if(!path)return next();response.setHeader('Content-Type','application/octet-stream');response.end(readFileSync(path));});},
    };
}

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['resources/js/tests/setup.js'],
        include: ['resources/js/tests/**/*.test.{js,jsx}'],
        css: false,
    },
    plugins: [
        pdfAssets(),
        react(),
        laravel({
            input: [
                'resources/sass/app.scss',
                'resources/js/app.js',
                'resources/js/presales.jsx',
                'resources/js/workspace.js',
                'resources/js/guest.js',
                'resources/js/spreadsheet.js',
                'node_modules/frappe-gantt/dist/frappe-gantt.css',
            ],
            refresh: true,
        }),
    ],
    css: {
        preprocessorOptions: {
            scss: {
                silenceDeprecations: ['import', 'global-builtin', 'color-functions']
            }
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
                        return 'vendor-react';
                    }
                    if (id.includes('node_modules/chart.js') || id.includes('node_modules/react-chartjs-2')) {
                        return 'vendor-charts';
                    }
                    if (id.includes('node_modules/@dnd-kit') || id.includes('node_modules/react-beautiful-dnd')) {
                        return 'vendor-dnd';
                    }
                },
            },
        },
    },
});
