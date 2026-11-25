const brasiliaClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Feriados recorrentes nacionais e do Rio de Janeiro.
const fixedHolidays = new Set([
  '01-01', '01-20', '04-21', '04-23', '05-01', '09-07', '10-12',
  '11-02', '11-15', '11-20', '12-25',
]);
const extraClosures = new Set(); // Datas extraordinárias no formato AAAA-MM-DD.

function easterSunday(year) {
  // Cálculo gregoriano de Meeus/Jones/Butcher.
  const cycle = year % 19;
  const century = Math.floor(year / 100);
  const withinCentury = year % 100;
  const correction = Math.floor((century + 8) / 25);
  const moon = (19 * cycle + century - Math.floor(century / 4)
    - Math.floor((century - correction + 1) / 3) + 15) % 30;
  const weekday = (32 + 2 * (century % 4) + 2 * Math.floor(withinCentury / 4)
    - moon - withinCentury % 4) % 7;
  const adjustment = Math.floor((cycle + 11 * moon + 22 * weekday) / 451);
  const date = moon + weekday - 7 * adjustment + 114;
  return Date.UTC(year, Math.floor(date / 31) - 1, date % 31 + 1);
}

export function isWhatsAppOpen(now = new Date()) {
  const parts = Object.fromEntries(brasiliaClock.formatToParts(now).map(({type, value}) => [type, value]));
  const {year, month, day, hour, minute} = parts;
  const date = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const weekDay = new Date(date).getUTCDay();
  const daysFromEaster = (date - easterSunday(Number(year))) / 86_400_000;
  if (weekDay === 0 || fixedHolidays.has(`${month}-${day}`)
    || extraClosures.has(`${year}-${month}-${day}`)
    || [-47, -2, 60].includes(daysFromEaster)) return false;

  const time = Number(hour) * 60 + Number(minute);
  return weekDay === 6 ? time >= 540 && time < 960 : time >= 480 && time < 1200;
}

if (typeof document !== 'undefined') {
  const dialog = document.querySelector('#whatsapp-hours');
  for (const button of document.querySelectorAll('[data-whatsapp]')) {
    button.addEventListener('click', () => {
      if (isWhatsAppOpen()) {
        window.location.assign('https://w.app/y4mrqu');
      } else {
        dialog.showModal();
      }
    });
  }
}
