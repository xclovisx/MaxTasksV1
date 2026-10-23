import { z } from 'zod';

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum');
const tijd = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ongeldige tijd').nullable();
const werkdag = z.number().int().min(1).max(7);

export const prioriteitSchema = z.enum(['laag', 'middel', 'hoog', 'zsm', 'nu']);
export const statusSchema = z.enum(['open', 'bezig', 'klaar']);

export const MAX_STOPS = 9;

export const locatieSchema = z.object({
  naam: z.string().trim().min(1, 'Naam van de locatie is verplicht').max(100),
  adres: z.string().trim().min(1, 'Adres is verplicht').max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  googlePlaceId: z.string().max(300).nullable().default(null),
});

export const stopSchema = locatieSchema.extend({
  locatieId: z.string().uuid().nullable().default(null),
  bewaar: z.boolean().default(false),
});

export const stopsSchema = z.array(stopSchema).max(MAX_STOPS, `Maximaal ${MAX_STOPS} locaties`).default([]);
export const puntSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const taakVeldenSchema = z.object({
  titel: z.string().trim().min(1, 'Titel is verplicht').max(200, 'Titel is te lang'),
  omschrijving: z.string().trim().max(2000, 'Omschrijving is te lang').default(''),
  datum,
  tijd,
  prioriteit: prioriteitSchema,
  stops: stopsSchema,
});

export const herhalingSchema = z
  .object({
    type: z.enum(['dagelijks', 'wekelijks', 'maandelijks', 'weekdagen', 'elke_x_weken']),
    weekdagen: z.array(werkdag).default([]),
    intervalWeken: z.number().int().min(1).max(52).default(1),
  })
  .refine((h) => h.type !== 'weekdagen' || h.weekdagen.length > 0, { message: 'Kies minstens één weekdag', path: ['weekdagen'] })
  .refine((h) => h.type !== 'elke_x_weken' || h.intervalWeken >= 2, { message: 'Kies minstens 2 weken', path: ['intervalWeken'] });

export const nieuweTaakSchema = taakVeldenSchema.extend({
  bordId: z.string().uuid('Ongeldig bord'),
  herhaling: herhalingSchema.nullable(),
});

export const reeksSchema = taakVeldenSchema.omit({ datum: true }).extend({ herhaling: herhalingSchema });

export const instellingenSchema = z
  .object({
    naam: z.string().trim().min(1, 'Naam is verplicht').max(100),
    garageAdres: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
    garageLat: z.number().min(-90).max(90).nullable().optional().transform((v) => v ?? null),
    garageLng: z.number().min(-180).max(180).nullable().optional().transform((v) => v ?? null),
    werkdagen: z.array(werkdag).min(1, 'Kies minstens één werkdag').transform((w) => [...new Set(w)].sort((a, b) => a - b)),
  })
  .transform((i) => (i.garageAdres ? i : { ...i, garageLat: null, garageLng: null }));

export const ntfyOnderwerpSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{0,64}$/, 'Onderwerp: maximaal 64 tekens, alleen letters, cijfers, - en _')
  .transform((v) => v || null);

export const bordNaamSchema = z.string().trim().min(1, 'Naam is verplicht').max(60);

export const medewerkerSchema = z.object({
  naam: z.string().trim().min(1, 'Naam is verplicht').max(100),
  gebruikersnaam: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, 'Gebruikersnaam: 3–32 tekens, alleen letters, cijfers, punt, streepje of underscore'),
});

export function isUuid(x: string): boolean {
  return z.string().uuid().safeParse(x).success;
}

export type TaakVeldenInvoer = z.input<typeof taakVeldenSchema>;
export type NieuweTaakInvoer = z.input<typeof nieuweTaakSchema>;
export type ReeksInvoer = z.input<typeof reeksSchema>;
export type InstellingenInvoer = z.input<typeof instellingenSchema>;
export type MedewerkerInvoer = z.input<typeof medewerkerSchema>;
export type HerhalingInvoer = z.output<typeof herhalingSchema>;
export type LocatieInvoer = z.input<typeof locatieSchema>;
export type StopInvoer = z.output<typeof stopSchema>;
