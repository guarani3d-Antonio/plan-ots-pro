import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({plugins:[react()],resolve:{alias:[{find:/.*\/db\/supabase(?:\.ts)?$/,replacement:fileURLToPath(new URL('./qa-directory-mock.ts',import.meta.url))}]},server:{host:'127.0.0.1',port:5295,strictPort:true}});
