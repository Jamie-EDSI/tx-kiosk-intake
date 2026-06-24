export type BusinessHoursWindow = {
  days: number[];
  open: string;
  close: string;
};

const fallbackHours: BusinessHoursWindow[] = [
  { days: [1, 2, 3, 4, 5], open: "08:30", close: "17:00" }
];

export function getBusinessHours(): BusinessHoursWindow[] {
  const raw = process.env.NEXT_PUBLIC_BUSINESS_HOURS;
  if (!raw) return fallbackHours;

  try {
    const parsed = JSON.parse(raw) as BusinessHoursWindow[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallbackHours;
  } catch {
    return fallbackHours;
  }
}

export function isWithinBusinessHours(now = new Date(), windows = getBusinessHours()) {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  return windows.some((window) => {
    if (!window.days.includes(day)) return false;
    return minutes >= toMinutes(window.open) && minutes < toMinutes(window.close);
  });
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
