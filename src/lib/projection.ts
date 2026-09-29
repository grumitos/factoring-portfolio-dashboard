// Modelo de proyección compartido: lo usan el servidor (fecha estimada de la meta) y el gráfico
// del cliente, para que ambos den siempre la misma fecha. Sin dependencias.
//
// Se simula en pasos de medio mes: el saldo crece medio mes y el aporte mensual entra a mitad de mes.

export interface ProjectionParams {
  /** Saldo inicial en PEN */
  startBalance: number;
  /** Tasa anual efectiva, en porcentaje */
  annualRatePct: number;
  /** Aporte mensual en PEN */
  monthlyInjection: number;
}

const halfMonthFactor = (annualRatePct: number): number => {
  const rMonth = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  return Math.pow(1 + rMonth, 0.5);
};

/** Meses (en múltiplos de 0.5) hasta alcanzar la meta, o null si no se alcanza en maxHalfSteps pasos */
export const monthsToGoal = (params: ProjectionParams, goal: number, maxHalfSteps: number): number | null => {
  const factor = halfMonthFactor(params.annualRatePct);
  let balance = params.startBalance;
  let k = 0;

  while (balance < goal && k < maxHalfSteps) {
    k++;
    balance *= factor;
    if (k % 2 === 1) balance += params.monthlyInjection;
  }

  return balance >= goal ? k * 0.5 : null;
};

/** Saldo proyectado al cierre de cada mes: índice 0 = hoy, índice n = dentro de n meses */
export const projectMonthlyBalances = (params: ProjectionParams, totalMonths: number): number[] => {
  const factor = halfMonthFactor(params.annualRatePct);
  const balances = [params.startBalance];
  let balance = params.startBalance;

  for (let k = 1; k <= totalMonths * 2; k++) {
    balance *= factor;
    if (k % 2 === 1) balance += params.monthlyInjection;
    else balances.push(balance);
  }

  return balances;
};

/** Primer día del mes que cae `months` meses (redondeados) después de `from` */
export const monthFromNow = (months: number, from: Date = new Date()): Date =>
  new Date(from.getFullYear(), from.getMonth() + Math.round(months), 1);
