// Affordability calculation shared by the Tools calculator and the agent's buyer-facing
// "what you can afford" share, so the two never drift.

import { monthlyPayment } from './finance';

export interface AffordInputs {
  income: number;
  debts: number;
  down: number;
  rate: number;
  term: string;
  dti: number;
  taxRate: number;
  insRate: number;
  hoa: number;
}

export interface AffordResult {
  maxPrice: number;
  maxLoan: number;
  pi: number;
  escrow: number;
  totalPayment: number;
  maxHousing: number;
}

/** Max home price from income + DTI, backing out taxes/insurance/HOA so the total
 *  housing payment fits the DTI budget. */
export function affordability(i: AffordInputs): AffordResult {
  const monthlyIncome = i.income / 12;
  const maxHousing = Math.max(0, (monthlyIncome * i.dti) / 100 - i.debts);
  const r = i.rate / 100 / 12;
  const months = (parseInt(i.term, 10) || 30) * 12;
  const factor = r > 0 ? (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1) : 1 / months;
  const escRate = (i.taxRate + i.insRate) / 100 / 12;
  const loanBudget = maxHousing - i.hoa - i.down * escRate;
  const maxLoan = Math.max(0, loanBudget / (factor + escRate));
  const maxPrice = maxLoan + i.down;
  const pi = monthlyPayment(maxLoan, i.rate, parseInt(i.term, 10) || 30);
  const escrow = maxPrice * escRate;
  const totalPayment = pi + escrow + i.hoa;
  return { maxPrice, maxLoan, pi, escrow, totalPayment, maxHousing };
}
