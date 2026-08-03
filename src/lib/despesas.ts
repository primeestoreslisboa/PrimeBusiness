export const CATEGORIAS_DESPESA = [
  'Material/Stock',
  'Ferramentas/Equipamento',
  'Combustível/Deslocações',
  'Rendas/Serviços',
  'Salários',
  'Impostos',
  'Outros',
] as const;

export function normalizeCategoria(v: string | null | undefined): string {
  const s = (v || '').trim();
  return (CATEGORIAS_DESPESA as readonly string[]).includes(s) ? s : 'Outros';
}
