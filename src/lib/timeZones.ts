const CURATED_TIME_ZONES = [
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Manaus",
  "America/Boa_Vista",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Rio_Branco",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Africa/Luanda",
] as const;

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

export function getSupportedTimeZones() {
  const supported = (Intl as IntlWithSupportedValues).supportedValuesOf?.(
    "timeZone",
  );
  return Array.from(
    new Set([...(supported ?? []), ...CURATED_TIME_ZONES]),
  ).sort((left, right) => left.localeCompare(right));
}

export function isValidTimeZone(value: string, supported?: string[]) {
  const normalized = value.trim();
  if (!normalized) return false;
  const known = supported ?? getSupportedTimeZones();
  if (!known.includes(normalized)) return false;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: normalized }).format(
      new Date(),
    );
    return true;
  } catch {
    return false;
  }
}

export function formatTimeZoneLabel(value: string) {
  const [region, ...locationParts] = value.split("/");
  const location = locationParts.join(" / ").replaceAll("_", " ");
  return location ? `${location} · ${region}` : value;
}

export const TIME_ZONE_FALLBACKS = CURATED_TIME_ZONES;
