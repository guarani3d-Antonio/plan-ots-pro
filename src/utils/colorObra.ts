import type {CSSProperties} from 'react';
// Ten families, six shades: 60 choices, including muted and vivid colors.
export const COLORES_OBRA = [
  '#1E3A8A','#1D4ED8','#2563EB','#3B82F6','#60A5FA','#93C5FD',
  '#312E81','#4338CA','#4F46E5','#6366F1','#818CF8','#A5B4FC',
  '#581C87','#7E22CE','#9333EA','#A855F7','#C084FC','#D8B4FE',
  '#831843','#BE185D','#DB2777','#EC4899','#F472B6','#F9A8D4',
  '#7F1D1D','#B91C1C','#DC2626','#EF4444','#F87171','#FCA5A5',
  '#7C2D12','#C2410C','#EA580C','#F97316','#FB923C','#FDBA74',
  '#78350F','#B45309','#D97706','#F59E0B','#FBBF24','#FCD34D',
  '#365314','#4D7C0F','#65A30D','#84CC16','#A3E635','#BEF264',
  '#064E3B','#047857','#059669','#10B981','#34D399','#6EE7B7',
  '#164E63','#0E7490','#0891B2','#06B6D4','#22D3EE','#67E8F9',
] as const;
export const COLOR_OBRA_DEFAULT = '#3B82F6';
export function colorObra(color?: string | null) { return /^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : COLOR_OBRA_DEFAULT; }
export function estiloObra(color?: string | null): CSSProperties {
  const hex=colorObra(color);
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  return { background:`rgb(${rgb.map(c=>Math.round(c*.12+255*.88)).join(',')})`, color:'#172033', borderColor:hex };
}
