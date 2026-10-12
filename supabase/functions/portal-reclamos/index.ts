import {createClient} from 'npm:@supabase/supabase-js@2';
import {createPortalHandler} from '../_shared/portalProtocol.mjs';

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth:{persistSession:false,autoRefreshToken:false},
});
Deno.serve(createPortalHandler({
  async rpc(name:string,args:Record<string,unknown>) {
    const result = await client.rpc(name,args);
    if (result.error) throw new Error('Portal operation failed');
    return result.data;
  },
  async upload(path:string,bytes:Uint8Array,mime:string) {
    const result = await client.storage.from('fotos').upload(path,bytes,{contentType:mime,upsert:true});
    if (result.error) throw new Error('Evidence upload failed');
  },
}));
