export type HolidayProviderId = "br_local_pack" | "nager_date_api";

export interface HolidayCountry {
  code: string;
  name: string;
  localPack?: boolean;
}

export interface HolidayCandidate {
  date: string;
  name: string;
  countryCode: string;
  subdivisionCode: string | null;
  source: HolidayProviderId;
  sourceId: string;
  importedYear: number;
  holidayType: string;
  observed: boolean;
  optional: boolean;
  metadata: Record<string, unknown>;
}

export interface HolidayImportOptions {
  countryCode: string;
  year: number;
  subdivisionCode?: string | null;
  includeOptional?: boolean;
  includeNational?: boolean;
  includeSubdivisions?: boolean;
}

export const HOLIDAY_COUNTRIES: HolidayCountry[] = [
  { code: "BR", name: "Brasil", localPack: true },
  { code: "AR", name: "Argentina" },
  { code: "BO", name: "Bolívia" },
  { code: "CA", name: "Canadá" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colômbia" },
  { code: "EC", name: "Equador" },
  { code: "ES", name: "Espanha" },
  { code: "FR", name: "França" },
  { code: "GB", name: "Reino Unido" },
  { code: "MX", name: "México" },
  { code: "AO", name: "Angola" },
  { code: "PE", name: "Peru" },
  { code: "PY", name: "Paraguai" },
  { code: "PT", name: "Portugal" },
  { code: "US", name: "Estados Unidos" },
  { code: "UY", name: "Uruguai" },
  { code: "VE", name: "Venezuela" },
];

function dateToIso(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function calculateGregorianEaster(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function brHoliday(
  year: number,
  month: number,
  day: number,
  name: string,
): HolidayCandidate {
  return {
    date: dateToIso(new Date(Date.UTC(year, month - 1, day, 12))),
    name,
    countryCode: "BR",
    subdivisionCode: null,
    source: "br_local_pack",
    sourceId: `BR-${year}-${month}-${day}-${name}`,
    importedYear: year,
    holidayType: "national",
    observed: true,
    optional: false,
    metadata: { provider: "BR_LOCAL_PACK" },
  };
}

export function buildBrazilHolidayPack(year: number, includeOptional = false) {
  const easter = calculateGregorianEaster(year);
  const holidays = [
    brHoliday(year, 1, 1, "Confraternização Universal"),
    brHoliday(year, 4, 21, "Tiradentes"),
    brHoliday(year, 5, 1, "Dia do Trabalhador"),
    brHoliday(year, 9, 7, "Independência do Brasil"),
    brHoliday(year, 10, 12, "Nossa Senhora Aparecida"),
    brHoliday(year, 11, 2, "Finados"),
    brHoliday(year, 11, 15, "Proclamação da República"),
    brHoliday(year, 11, 20, "Dia Nacional de Zumbi e da Consciência Negra"),
    brHoliday(year, 12, 25, "Natal"),
    {
      ...brHoliday(year, 1, 1, "Sexta-feira Santa"),
      date: dateToIso(addUtcDays(easter, -2)),
      sourceId: `BR-${year}-GOOD-FRIDAY`,
      holidayType: "religious",
    },
  ];
  if (includeOptional) {
    holidays.push(
      {
        ...brHoliday(year, 1, 1, "Corpus Christi"),
        date: dateToIso(addUtcDays(easter, 60)),
        sourceId: `BR-${year}-CORPUS-CHRISTI`,
        holidayType: "observance",
        optional: true,
      },
      {
        ...brHoliday(year, 1, 1, "Carnaval"),
        date: dateToIso(addUtcDays(easter, -47)),
        sourceId: `BR-${year}-CARNIVAL`,
        holidayType: "observance",
        optional: true,
      },
    );
  }
  return holidays.sort((left, right) => left.date.localeCompare(right.date));
}

interface NagerHoliday {
  date?: unknown;
  name?: unknown;
  countryCode?: unknown;
  nationalHoliday?: unknown;
  subdivisionCodes?: unknown;
  holidayTypes?: unknown;
}

export async function fetchNagerDateHolidays(options: HolidayImportOptions) {
  const countryCode = options.countryCode.trim().toUpperCase();
  const response = await fetch(
    `https://date.nager.at/api/v4/Holidays/${encodeURIComponent(countryCode)}/${options.year}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(
      `Nager.Date respondeu ${response.status}. Tente novamente ou use um pack local disponível.`,
    );
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("Nager.Date retornou um formato inesperado.");
  }

  return payload
    .flatMap((item, index): HolidayCandidate[] => {
      const row = item as NagerHoliday;
      const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const national = row.nationalHoliday !== false;
      const subdivisionCodes = Array.isArray(row.subdivisionCodes)
        ? row.subdivisionCodes.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const types = Array.isArray(row.holidayTypes)
        ? row.holidayTypes.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) return [];
      if (!options.includeNational && national) return [];
      const requestedSubdivision = options.subdivisionCode?.trim() || null;
      if (
        requestedSubdivision &&
        subdivisionCodes.length > 0 &&
        !subdivisionCodes.includes(requestedSubdivision)
      ) {
        return [];
      }
      if (
        !options.includeSubdivisions &&
        subdivisionCodes.length > 0 &&
        !national
      ) {
        return [];
      }
      const optional = types.some((type) => /optional|observance/i.test(type));
      if (optional && !options.includeOptional) return [];
      return [
        {
          date,
          name,
          countryCode,
          subdivisionCode: requestedSubdivision ?? subdivisionCodes[0] ?? null,
          source: "nager_date_api",
          sourceId: `${countryCode}-${date}-${index}-${name}`,
          importedYear: options.year,
          holidayType: types.join(",") || (national ? "national" : "regional"),
          observed: true,
          optional,
          metadata: {
            provider: "NAGER_DATE_API",
            nationalHoliday: national,
            subdivisionCodes,
            holidayTypes: types,
          },
        },
      ];
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}
