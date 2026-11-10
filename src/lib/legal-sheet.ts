/**
 * Salvedad jurídica sobre el uso de la firma electrónica que se imprime en la planilla oficial.
 * Configurable en Configuración → Empresa y formato. Debe ser revisada por un abogado colombiano.
 * Marcadores: {{EMPRESA}}, {{URL_VERIFICACION}}.
 */
export const DEFAULT_SHEET_LEGAL_NOTICE = `1. Naturaleza de las firmas. Las firmas que aparecen en esta planilla no fueron estampadas en tinta sobre papel: son la representación gráfica de firmas electrónicas realizadas por cada asistente en la plataforma FirmaQR de {{EMPRESA}}, en los términos del artículo 7 de la Ley 527 de 1999 y del Decreto 2364 de 2012 (compilado en el Decreto Único Reglamentario 1074 de 2015).
2. Mecanismo y atribución. La firma de cada asistente se compone de: (i) autenticación mediante un código de un solo uso (OTP) enviado a un canal bajo su control; (ii) aceptación previa y expresa del acuerdo de uso de firma electrónica, con su versión; (iii) captura del trazo manuscrito; y (iv) vinculación al registro mediante huella criptográfica SHA-256. La imagen de la firma, por sí sola, no acredita la identidad del firmante: su atribución se sustenta en el conjunto de evidencias conservadas en el expediente digital de cada registro (código «Exp.» bajo cada nombre).
3. Alcance. Es una firma electrónica convenida entre las partes, confiable y apropiada únicamente para la finalidad de registrar la asistencia a este evento. No es una firma digital certificada por una entidad de certificación digital (artículo 28 de la Ley 527 de 1999) ni sustituye formalidades especiales que la ley exija para otros actos.
4. Original e integridad. El documento original es el mensaje de datos conservado en FirmaQR (artículos 8, 9 y 12 de la Ley 527 de 1999). Esta planilla, impresa o descargada, es una representación de ese original; su autenticidad e integridad se verifican con el código de verificación en {{URL_VERIFICACION}}. Cualquier enmienda, tachadura o adición manuscrita sobre esta planilla carece de validez.
5. Datos personales. Los datos registrados se tratan conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015), según la autorización otorgada por cada titular.`;

export const SHEET_LEGAL_TITLE = 'SALVEDAD SOBRE EL USO DE LA FIRMA ELECTRÓNICA';
