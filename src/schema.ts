import { z } from 'zod';

export const eventTypeSchema = z.enum(['competition', 'promotion', 'open_mat', 'seminar']);
export const sportSchema = z.enum(['bjj', 'grappling', 'judo', 'wrestling', 'mma', 'other']);

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'deve ser YYYY-MM-DD');
const httpUrl = (field: string) =>
  z
    .string()
    .url()
    // Restringe a http(s): z.url() sozinho aceitaria "javascript:..." e outros
    // schemes perigosos, que poderiam virar href no app (defesa em profundidade).
    .refine((u) => /^https?:\/\//i.test(u), `${field} deve usar http(s)`);

export const scrapedEventSchema = z
  .object({
    // v1 — inalterado; `id` é referenciado por inscrições em produção.
    id: z.string().min(1),
    title: z.string().min(1),
    type: eventTypeSchema,
    date: z.string().min(1), // display PT-BR
    location: z.string(),
    ctaLabel: z.string().min(1),
    icon: z.string().min(1),
    dateISO: isoDay,
    source: z.string().min(1),
    sourceUrl: httpUrl('sourceUrl'),
    imageUrl: httpUrl('imageUrl').optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'accentColor deve ser hex #RRGGBB')
      .optional(),
    scrapedAt: z.string().datetime(),

    // v2 — opcionais e aditivos (contrato events-v2). Ausente = desconhecido.
    sourceId: z.string().regex(/^[a-z0-9-]+:[A-Za-z0-9_-]+$/, 'sourceId deve ser fonte:idNativo').optional(),
    endDateISO: isoDay.optional(),
    venue: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().regex(/^[A-Z]{2,3}$/, 'state deve ser sigla maiúscula').optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/, 'countryCode deve ser ISO alpha-2').optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    gi: z.boolean().optional(),
    nogi: z.boolean().optional(),
    kids: z.boolean().optional(),
    organizer: z.string().min(1).optional(),
    sport: sportSchema.optional(),
    registrationDeadlineISO: isoDay.optional(),
  })
  .refine((e) => !e.endDateISO || e.endDateISO >= e.dateISO, {
    message: 'endDateISO não pode vir antes de dateISO',
    path: ['endDateISO'],
  })
  .refine((e) => (e.lat === undefined) === (e.lng === undefined), {
    message: 'lat e lng vêm juntos',
    path: ['lat'],
  })
  .refine((e) => !(e.lat === 0 && e.lng === 0), {
    message: 'lat/lng 0,0 é "não geocodificado", não uma posição',
    path: ['lat'],
  })
  .refine((e) => !e.registrationDeadlineISO || e.registrationDeadlineISO < e.dateISO, {
    message: 'registrationDeadlineISO deve ser anterior ao evento (nunca a data dele)',
    path: ['registrationDeadlineISO'],
  });

export const outputSchema = z.array(scrapedEventSchema);

export type ScrapedEventParsed = z.infer<typeof scrapedEventSchema>;
