import type { TipoDocumento } from '../../services/documentService';
import { CAMPOS_IDENTIFICACION, type IdentificacionInforme } from '../../services/reportAutofillService';
import { CampoTextoInforme, DatoInforme, EtiquetaLectura } from './CampoTextoInforme';
import styles from './EtapasOT.module.css';

export function IdentificacionInformeCampos({tipo,identificacion,disabled,onUbicacion}:{
  tipo:TipoDocumento; identificacion:IdentificacionInforme; disabled:boolean; onUbicacion:(value:string)=>void;
}) {
  const grupo=(title:string,keys:string[],open=true)=><details className={styles.editorGroup} open={open}>
    <summary>{title}<EtiquetaLectura/></summary>
    <div className={styles.editorGroupBody}><div className={styles.grid}>
      {CAMPOS_IDENTIFICACION.filter(([key])=>keys.includes(key)).map(([key,label])=>
        <div key={key} className={styles.field} style={{'--field-span':key==='descripcion'?12:6} as React.CSSProperties}>
          <DatoInforme etiqueta={label} value={key==='fecha_ingreso'&&/^\d{4}-\d{2}-\d{2}$/.test(identificacion[key])?identificacion[key].split('-').reverse().join('/'):identificacion[key]} multiline={key==='descripcion'}/>
        </div>)}
    </div></div>
  </details>;
  return <div className={`${styles.fields} ${styles.reportEditor}`} data-tipo={tipo} data-report-section="identificacion">
    <p className={styles.note}>Datos vinculados de la obra, el cliente y la OT. Se corrigen en su ficha de origen con permiso; las versiones guardadas conservan sus datos.</p>
    {grupo('Obra y orden de trabajo',['obra','unidad_amenities','responsable','rubro','fecha_ingreso','direccion_obra','piso'])}
    {grupo('Cliente y contacto',['cliente','identificacion','contacto','telefono','correo','domicilio'])}
    <details className={styles.editorGroup} open>
      <summary>Referencia de ubicación{disabled&&<EtiquetaLectura/>}</summary>
      <div className={styles.editorGroupBody}><CampoTextoInforme etiqueta="Ubicación referencial" value={identificacion.ubicacion} onChange={onUbicacion} disabled={disabled} multiline placeholder="Ej.: estar, junto a la ventana del balcón."/></div>
    </details>
    {grupo('Solicitud original',['descripcion'],false)}
  </div>;
}
