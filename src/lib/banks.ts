/** Client-safe list of Nigerian banks used by beneficiary forms (no database imports). */
export const BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "058", name: "GTBank (Guaranty Trust)" },
  { code: "057", name: "Zenith Bank" },
  { code: "070", name: "First Bank of Nigeria" },
  { code: "076", name: "First Bank (legacy)" },
  { code: "232", name: "United Bank for Africa (UBA)" },
  { code: "033", name: "Union Bank" },
  { code: "011", name: "First City Monument Bank (FCMB)" },
  { code: "082", name: "Sterling Bank" },
  { code: "214", name: "First Bank / Sterling merger" },
  { code: "070-1", name: "Wema Bank (ALAT)" },
  { code: "0901", name: "OPay (Fidelity)" },
  { code: "070-2", name: "Kuda Microfinance Bank" },
  { code: "100034", name: "Moniepoint MFB" },
  { code: "300005", name: "Providus Bank" },
  { code: "063", name: "Nigeria Inter-Bank Settlement System (MFB)" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "084", name: "Enterprise Bank" },
  { code: "035", name: "Heritage Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "222", name: "Standard Chartered" },
  { code: "023", name: "Diamond Bank (Union)" },
  { code: "999", name: "Other Nigerian bank" },
];

export function bankName(codeOrName: string) {
  return BANKS.find((b) => b.code === codeOrName || b.name === codeOrName)?.name ?? codeOrName;
}
