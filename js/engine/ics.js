// Recordatorios: archivo .ics (Google Calendar / cualquier calendario) y links "Agregar a Google Calendar".
import { addDays } from './dates.js';
import { money } from './money.js';

const compact = (d) => d.replace(/-/g, '');
const esc = (s) => String(s).replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

export function reminderEvents(dash) {
  const ev = [];
  for (const s of dash.statements) {
    ev.push({ uid: `stmt-${s.id}`, date: s.due, title: `Pagar ${s.cardName} ${money(s.remaining)}`, details: 'Paga el monto para no generar intereses. Nunca solo el mínimo.' });
  }
  for (const p of dash.payPlan) {
    if (p.onDue) continue;
    ev.push({ uid: `plan-${p.statement}-${p.date}`, date: p.date, title: `Abonar ${money(p.amount)} a ${p.cardName}`, details: 'Plan de pagos de FinanciaBass.' });
  }
  return ev;
}

export function buildICS(events, stamp) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FinanciaBass//ES', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT', `UID:${e.uid}@financiabass`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`,
      `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.details || '')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'TRIGGER:-P2DT15H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'TRIGGER:PT9H', 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function googleCalendarLink(e) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${compact(e.date)}/${compact(addDays(e.date, 1))}`, details: e.details || '' });
  return `https://calendar.google.com/calendar/render?${p}`;
}
