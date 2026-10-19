// Explicit coverage: a new bucket must be reviewed before transferring files.
const supportedBuckets=new Set([
 'planos','fotos','exports','directory-photos','profile-photos',
 'contractor-files','contractor-evidence',
]);

export function assertStorageCoverage(snapshot){
 const inventory=new Set();
 for(const object of snapshot.storage){
  if(!supportedBuckets.has(object.bucket_id))throw new Error('Nuevo depósito requiere revisar la cobertura: '+object.bucket_id);
  inventory.add(`${object.bucket_id}/${object.name}`);
 }
 // These versioned references contain bare paths, not storage:// URLs. Check
 // them explicitly so a missing original cannot produce an incomplete archive.
 const requireOriginal=(bucket,path)=>{
  if(path==null||path==='')return;
  if(typeof path!=='string'||!inventory.has(`${bucket}/${path}`))throw new Error('Falta un archivo referenciado en '+bucket);
 };
 for(const row of snapshot.tablas.plan_presupuesto_versiones||[])requireOriginal('contractor-files',row.datos?.adjunto?.path);
 for(const row of snapshot.tablas.plan_contratista_evaluacion_versiones||[])requireOriginal('contractor-evidence',row.fuentes?.evidencia?.path);
}
