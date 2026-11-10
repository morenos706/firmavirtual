/** Campos del formulario público. Los tres primeros son obligatorios por diseño:
 *  - documentNumber y fullName alimentan la planilla oficial (columnas Cédula / Nombre y Apellidos)
 *  - email es el canal de autenticación OTP y de entrega del comprobante. */
export const FIXED_FIELDS = ['documentNumber', 'fullName', 'email'] as const;

export type FieldKey = 'documentNumber' | 'fullName' | 'email' | 'company' | 'management' | 'area' | 'phone';

export const DEFAULT_FIELDS: { key: FieldKey; label: string; enabled: boolean; required: boolean; order: number }[] = [
  { key: 'documentNumber', label: 'Número de identificación (Cédula)', enabled: true, required: true, order: 1 },
  { key: 'fullName', label: 'Nombre y apellidos', enabled: true, required: true, order: 2 },
  { key: 'company', label: 'Empresa', enabled: true, required: true, order: 3 },
  { key: 'management', label: 'Gerencia', enabled: true, required: true, order: 4 },
  { key: 'area', label: 'Área', enabled: true, required: true, order: 5 },
  { key: 'email', label: 'Correo electrónico', enabled: true, required: true, order: 6 },
  { key: 'phone', label: 'Número de celular', enabled: false, required: false, order: 7 },
];

export const FIELD_KEYS = DEFAULT_FIELDS.map((f) => f.key);
