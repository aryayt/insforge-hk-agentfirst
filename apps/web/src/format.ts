export const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
