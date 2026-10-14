import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({plugins:[{name:'qa-in-memory-services',enforce:'pre',resolveId(source){if(/(?:customerConformityService|documentSignatureService|stores\/accessStore)(?:\.ts)?$/.test(source))return resolve('scripts/qa-conformidad-service.ts');}},react()],server:{host:'127.0.0.1',port:5179,strictPort:true}});
