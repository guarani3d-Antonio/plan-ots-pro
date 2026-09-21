import type { ImgHTMLAttributes } from 'react';
import { useArchivoPrivado } from '../../hooks/useArchivoPrivado';

export function ImagenPrivada({ referencia, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { referencia: string }) {
  const src = useArchivoPrivado(referencia);
  return src ? <img {...props} src={src} /> : null;
}
