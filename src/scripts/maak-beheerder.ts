import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { maakBeheerder } from '../lib/auth/accounts';
import { sluitDb } from '../lib/db/client';

async function main() {
  const [naam, gebruikersnaam] = process.argv.slice(2);
  if (!naam || !gebruikersnaam) {
    console.error('Gebruik: npm run maak-beheerder -- "<naam>" <gebruikersnaam>');
    process.exit(1);
  }
  let wachtwoord = process.env.BEHEERDER_WACHTWOORD;
  if (!wachtwoord) {
    const rl = createInterface({ input: stdin, output: stdout });
    wachtwoord = await rl.question('Wachtwoord (minimaal 8 tekens): ');
    rl.close();
  }
  const id = await maakBeheerder(naam, gebruikersnaam, wachtwoord);
  console.log(`Beheerder aangemaakt (${id}).`);
  await sluitDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await sluitDb();
  process.exit(1);
});
