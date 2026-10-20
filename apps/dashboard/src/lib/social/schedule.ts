export function localScheduleToIso(value: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Choose a date and time.");
  }
  const date = new Date(value);
  const parts = value.split(/[-T:]/).map(Number);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== parts[0] || date.getMonth() + 1 !== parts[1] ||
    date.getDate() !== parts[2] || date.getHours() !== parts[3] ||
    date.getMinutes() !== parts[4]
  ) {
    throw new Error("Choose a valid local date and time.");
  }
  if (date.getTime() <= now) throw new Error("Choose a future date and time.");
  return date.toISOString();
}

export function scheduleDay(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
