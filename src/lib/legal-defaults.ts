// Textos jurídicos por defecto. DEBEN ser revisados y ajustados por un abogado colombiano
// antes de su uso en producción. Son configurables desde Administración → Textos jurídicos,
// y cada cambio genera una nueva versión (la versión aceptada queda en el expediente).

export const DEFAULT_SIGNATURE_AGREEMENT = {
  title: 'Acuerdo de uso de firma electrónica',
  version: '1.0',
  content: `Al continuar, usted (el "Firmante") manifiesta de manera libre, previa, expresa e informada que:

1. Acepta utilizar el mecanismo de firma electrónica dispuesto por {{EMPRESA}} en la plataforma FirmaQR para dejar constancia de su asistencia al evento indicado en este formulario, en los términos de la Ley 527 de 1999, el Decreto 2364 de 2012 (compilado en el Decreto 1074 de 2015) y demás normas aplicables.

2. El mecanismo de firma consiste en: (i) la verificación de su identidad mediante un código de un solo uso (OTP) enviado al correo electrónico o número celular que usted registró y que se encuentra bajo su control exclusivo; (ii) la aceptación expresa del presente acuerdo; y (iii) el trazo manuscrito realizado por usted en la pantalla de su dispositivo.

3. Usted reconoce que dicho mecanismo es confiable y apropiado para la finalidad de registrar su asistencia, y que la firma así realizada le es atribuible.

4. FirmaQR conservará como evidencia: los datos de identificación registrados, la evidencia de autenticación (canal, fecha y hora), la manifestación de voluntad (aceptación de este acuerdo con su versión y huella SHA-256), la imagen y metadatos técnicos del trazo, la dirección IP, el navegador, y las huellas criptográficas SHA-256 que permiten verificar la integridad de los documentos generados.

5. Usted se compromete a no permitir que terceros utilicen sus datos o su código OTP. Si considera que su registro fue realizado por otra persona, informe a {{EMPRESA}}.

6. Esta firma electrónica se limita al registro de asistencia del evento y no constituye una firma digital certificada por una entidad de certificación abierta.`,
};

export const DEFAULT_DATA_TREATMENT = {
  title: 'Autorización para el tratamiento de datos personales',
  version: '1.0',
  content: `En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015), autorizo de manera previa, expresa e informada a {{EMPRESA}}, como Responsable del Tratamiento, para recolectar, almacenar, usar, circular y suprimir mis datos personales (identificación, nombre, empresa, gerencia, área, correo electrónico, número celular, firma manuscrita electrónica, dirección IP y datos técnicos del dispositivo) con las siguientes finalidades:

a) Registrar y acreditar mi asistencia al evento.
b) Generar la planilla oficial de asistencia y mi comprobante individual.
c) Enviarme el comprobante de asistencia por correo electrónico.
d) Conservar la evidencia electrónica para fines de trazabilidad, auditoría y cumplimiento de obligaciones legales y de formación.

Como titular tengo derecho a conocer, actualizar, rectificar y suprimir mis datos, solicitar prueba de esta autorización, ser informado del uso de mis datos, presentar quejas ante la Superintendencia de Industria y Comercio y revocar la autorización cuando no exista un deber legal o contractual de conservarlos. Puedo ejercer estos derechos a través de los canales dispuestos por {{EMPRESA}} en su Política de Tratamiento de Datos Personales.

No estoy obligado a suministrar datos sensibles. La firma manuscrita se recolecta exclusivamente para la finalidad de registro de asistencia.`,
};
