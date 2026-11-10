import { z } from 'zod';
import { FIELD_KEYS } from './fields';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');
const text = (max: number) => z.string().trim().min(1, 'Campo obligatorio').max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const eventFieldSchema = z.object({
  key: z.enum(FIELD_KEYS as [string, ...string[]]),
  label: text(80),
  enabled: z.boolean(),
  required: z.boolean(),
  order: z.number().int().min(0).max(100),
});

export const eventInputSchema = z
  .object({
    program: text(200),
    topic: text(250),
    relatedDocument: optText(200),
    name: text(200),
    description: optText(2000),
    trainer: text(150),
    institution: text(150),
    classification: z.enum(['INTERNAL', 'EXTERNAL']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    startTime: time,
    endTime: time,
    durationHours: z.coerce.number().positive('La duración debe ser mayor a 0').max(999),
    location: text(200),
    organizerId: z.string().optional(),
    otpChannel: z.enum(['EMAIL', 'SMS']).default('EMAIL'),
    requireDataConsent: z.boolean().default(true),
    duplicateRule: z.enum(['DOCUMENT', 'DOCUMENT_AND_EMAIL']).default('DOCUMENT'),
    fields: z.array(eventFieldSchema).optional(),
  })
  .refine((v) => v.endTime > v.startTime, { message: 'La hora de finalización debe ser posterior a la de inicio', path: ['endTime'] });

export type EventInput = z.infer<typeof eventInputSchema>;

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  name: text(120),
  role: z.enum(['ADMIN', 'ORGANIZER']),
  password: z.string().min(10).max(200),
});

export const userUpdateSchema = z.object({
  name: text(120).optional(),
  role: z.enum(['ADMIN', 'ORGANIZER']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(10).max(200).optional(),
});

/** Validación de datos del participante (formulario público). */
export const registrationSchema = z.object({
  documentNumber: z
    .string()
    .trim()
    .min(4, 'Número de identificación inválido')
    .max(20, 'Número de identificación inválido')
    .regex(/^[0-9A-Za-z.\- ]+$/, 'Solo números, letras, puntos o guiones'),
  fullName: z
    .string()
    .trim()
    .min(3, 'Ingrese nombre y apellidos')
    .max(150)
    .regex(/^[\p{L}\p{M}' .\-]+$/u, 'El nombre contiene caracteres no permitidos'),
  email: z.string().trim().toLowerCase().max(200).email('Correo electrónico inválido'),
  company: z.string().trim().max(150).optional().nullable(),
  management: z.string().trim().max(150).optional().nullable(),
  area: z.string().trim().max(150).optional().nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{7,15}$/, 'Número de celular inválido')
    .optional()
    .nullable()
    .or(z.literal('')),
});
export type RegistrationInput = z.infer<typeof registrationSchema>;
