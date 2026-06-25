// Helpers de formatação de horário com intervalo de atendimento (range).
// O horário é guardado como TIMESTAMP sem fuso (hora local de Lisboa);
// fazemos parsing dos componentes diretamente para evitar desvios de fuso.

function parseComponents(value: string | Date) {
  // Strings ISO-like ("2026-06-25T08:00" ou "2026-06-25 08:00:00") — parse direto
  // para preservar a hora local guardada (timestamp sem fuso).
  if (typeof value === 'string') {
    const withT = value.trim().replace(' ', 'T');
    const m = withT.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m) {
      return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
    }
  }
  // Objeto Date (ex: devolvido pelo driver Neon) — usa componentes locais.
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
    };
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "09:00 às 12:00" (início + intervalo de horas). */
export function timeRangeLabel(value: string | Date | null | undefined, intervaloHoras = 3): string {
  if (!value) return '-';
  const c = parseComponents(value);
  if (!c) return String(value);
  const endHour = c.hour + intervaloHoras;
  return `${pad(c.hour)}:${pad(c.minute)} às ${pad(endHour)}:${pad(c.minute)}`;
}

/** "Quarta-feira, 25/06/2026, 09:00 às 12:00". */
export function dateTimeRangeLabel(value: string | Date | null | undefined, intervaloHoras = 3): string {
  if (!value) return '-';
  const c = parseComponents(value);
  if (!c) return String(value);
  // Meio-dia UTC para o rótulo da data evita problemas de DST na meia-noite.
  const dateObj = new Date(Date.UTC(c.year, c.month - 1, c.day, 12, 0, 0));
  const dateFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'full', timeZone: 'UTC' });
  return `${dateFmt.format(dateObj)}, ${timeRangeLabel(value, intervaloHoras)}`;
}
