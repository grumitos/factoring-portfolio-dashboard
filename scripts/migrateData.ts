import fs from 'fs/promises';
import path from 'path';
import { supabase } from '../src/lib/supabaseClient';

const dataDir = path.join(__dirname, '..', 'src', 'data');

async function readJson(file: string) {
  const p = path.join(dataDir, file);
  const text = await fs.readFile(p, 'utf8');
  return JSON.parse(text);
}

async function main() {
  const investments = await readJson('investmentDetails.json');
  const earningsPen = await readJson('earningsPEN.json');
  const earningsUsd = await readJson('earningsUSD.json');
  const movementsPen = await readJson('movementsPEN.json');
  const movementsUsd = await readJson('movementsUSD.json');

  const earnings = [...earningsPen, ...earningsUsd];
  const movements = [...movementsPen, ...movementsUsd];

  await supabase.from('investments').insert(investments);
  await supabase.from('earnings').insert(earnings);
  await supabase.from('movements').insert(movements);
}

main().then(() => console.log('Migration complete')).catch(err => {
  console.error('Migration failed:', err);
});
