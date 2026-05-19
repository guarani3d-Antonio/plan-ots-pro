import React, { useState } from 'react';
import styles from './CalendarPicker.module.css';

interface Props {
  value?: string | null; // YYYY-MM-DD
  onChange: (date: string) => void;
  onClose: () => void;
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DS = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];

export const CalendarPicker: React.FC<Props> = ({ value, onChange, onClose }) => {
  const hoy = new Date();
  const init = value ? new Date(value + 'T00:00:00') : hoy;
  const [año, setAño]   = useState(init.getFullYear());
  const [mes, setMes]   = useState(init.getMonth());

  const seleccionado = value ? new Date(value + 'T00:00:00') : null;

  const primerDia   = new Date(año, mes, 1).getDay();
  const diasEnMes   = new Date(año, mes + 1, 0).getDate();

  const anterior = () => {
    if (mes === 0) { setMes(11); setAño(a => a - 1); }
    else setMes(m => m - 1);
  };
  const siguiente = () => {
    if (mes === 11) { setMes(0); setAño(a => a + 1); }
    else setMes(m => m + 1);
  };

  const elegir = (dia: number) => {
    const mm = String(mes + 1).padStart(2, '0');
    const dd = String(dia).padStart(2, '0');
    onChange(`${año}-${mm}-${dd}`);
    onClose();
  };

  const esSel = (d: number) =>
    seleccionado &&
    seleccionado.getFullYear() === año &&
    seleccionado.getMonth() === mes &&
    seleccionado.getDate() === d;

  const esHoy = (d: number) =>
    hoy.getFullYear() === año && hoy.getMonth() === mes && hoy.getDate() === d;

  const celdas: (number | null)[] = [];
  for (let i = 0; i < primerDia; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d);
  while (celdas.length % 7 !== 0) celdas.push(null);

  const hoyStr = () => {
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    return `${hoy.getFullYear()}-${mm}-${dd}`;
  };

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <button className={styles.nav} onClick={anterior}>‹</button>
        <span className={styles.titulo}>{MESES[mes]} {año}</span>
        <button className={styles.nav} onClick={siguiente}>›</button>
      </div>

      <div className={styles.semana}>
        {DS.map(d => <span key={d} className={styles.ds}>{d}</span>)}
      </div>

      <div className={styles.grid}>
        {celdas.map((dia, i) =>
          dia ? (
            <button
              key={i}
              className={[
                styles.dia,
                esSel(dia) ? styles.diaSel : '',
                esHoy(dia) ? styles.diaHoy : '',
              ].filter(Boolean).join(' ')}
              onClick={() => elegir(dia)}
            >
              {dia}
            </button>
          ) : <span key={i} />
        )}
      </div>

      <div className={styles.footer}>
        <button className={styles.btnHoy} onClick={() => { onChange(hoyStr()); onClose(); }}>
          Hoy
        </button>
        <button className={styles.btnLimpiar} onClick={() => { onChange(''); onClose(); }}>
          Limpiar
        </button>
      </div>
    </div>
  );
};