import { useEffect } from 'react';
import { supabase } from '../db/supabase';
import { useOrdenesStore } from '../stores/ordenesStore';
import { ORDEN_SELECT,rowToOrden } from '../data/ordenMapper';
import { assertSession,sessionTicket } from '../security/sessionScope';
export function useRealtimeOrdenes(proyectoId:string|null) {
  useEffect(()=>{
    if(!proyectoId)return;
    let disposed=false;
    const ticket=sessionTicket();
    const refresh=async(id:string)=>{
      const {data,error}=await supabase.from('ordenes').select(ORDEN_SELECT).eq('id',id).single();
      if(disposed)return;
      try{assertSession(ticket);}catch{return;}
      if(!error&&data)useOrdenesStore.getState().agregarOActualizarOrden(rowToOrden(data));
    };
    const channel=supabase.channel('ordenes-'+proyectoId).on('postgres_changes',{event:'*',schema:'public',table:'ordenes',filter:'proyecto_id=eq.'+proyectoId},payload=>{
      if(disposed)return;
      try{assertSession(ticket);}catch{return;}
      if(payload.eventType==='DELETE'){
        const id=(payload.old as {id?:string}).id;if(id)useOrdenesStore.getState().aplicarEliminacionRemota(id);
      }else{const id=(payload.new as {id?:string}).id;if(id)void refresh(id);}
    }).subscribe();
    return()=>{disposed=true;void supabase.removeChannel(channel);};
  },[proyectoId]);
}
