import type {RevisionDocumento} from '../../../src/services/documentService';
import type {FirmaDocumento} from '../../../src/services/documentSignatureModel';
export const PLANTILLA_CONTROLADA_VERSION:string;
export function materializarHtmlControlado(revision:RevisionDocumento,fuentes:unknown,imagenes:Record<string,string>,firmas?:FirmaDocumento[]):string;
