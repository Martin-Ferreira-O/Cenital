// Currency formatting + price math. Locale is a display option; currency comes from the data.

export const finalPrice = (tier) => tier.price + (tier.fee || 0);

export function formatMoney(amount, currency = 'CLP', locale = 'es-CL') {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'CLP' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}
