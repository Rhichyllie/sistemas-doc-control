import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Default Brazilian holidays (fixed dates)
const DEFAULT_HOLIDAYS = [
  "01-01", // Ano Novo
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalhador
  "09-07", // Independência do Brasil
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "12-25", // Natal
];

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Domingo, 6 = Sábado
}

export function isHoliday(date: Date, customHolidays: string[] = []): boolean {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const allHolidays = [...DEFAULT_HOLIDAYS, ...customHolidays];
  return allHolidays.includes(mmdd);
}

export function isWorkingDay(date: Date, customHolidays: string[] = []): boolean {
  return !isWeekend(date) && !isHoliday(date, customHolidays);
}

export function addWorkingDays(startDate: Date, days: number, customHolidays: string[] = []): Date {
  let result = new Date(startDate);
  let daysAdded = 0;
  
  while (daysAdded < days) {
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result, customHolidays)) {
      daysAdded++;
    }
  }
  
  return result;
}
