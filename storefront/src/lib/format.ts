export const formatCurrency = (valueInMinor: number, currency: string, locale: string): string => {
  const formatter = new Intl.NumberFormat(locale ?? "cs-CZ", {
    style: "currency",
    currency: currency ?? "CZK",
    maximumFractionDigits: 0,
  });

  return formatter.format(valueInMinor / 100);
};

export const formatDateRelative = (isoDate: string | null | undefined, locale: string): string => {
  if (!isoDate) return "";

  const date = new Date(isoDate);
  const formatter = new Intl.RelativeTimeFormat(locale ?? "cs-CZ", { numeric: "auto" });
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return formatter.format(diffDays, "day");
};
