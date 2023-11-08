/// <reference types="vite/client" />
import {defineConfig} from 'vite';

export default defineConfig({
    build: {
        lib: {
            entry: './src/main.ts',
            formats: ['cjs'],
            name: 'main',
            fileName: 'main',
        },
    },
});
