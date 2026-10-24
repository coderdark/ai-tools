function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function formatOffset(date: Date): string {
  const minutesEastOfUtc = -date.getTimezoneOffset();
  const sign = minutesEastOfUtc < 0 ? "-" : "+";
  const minutes = Math.abs(minutesEastOfUtc);

  return `${sign}${twoDigits(Math.floor(minutes / 60))}:${twoDigits(minutes % 60)}`;
}

/** ISO 8601 local time to the minute with the UTC offset, such as 2026-05-09T18:06-05:00. */
export function formatDateTime(date: Date): string {
  const day = `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
  const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;

  return `${day}T${time}${formatOffset(date)}`;
}
