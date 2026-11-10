-- FirmaQR: controles de integridad a nivel de base de datos.
-- Estos controles garantizan que la evidencia no se modifique silenciosamente,
-- incluso si una consulta se ejecuta por fuera de la aplicación.

-- 1. Un solo registro vigente por número de identificación y evento.
CREATE UNIQUE INDEX "attendance_records_event_document_active_key"
  ON "attendance_records" ("event_id", "document_number_hash")
  WHERE "status" <> 'VOIDED';

-- 2. Bitácora de auditoría: solo inserción.
CREATE OR REPLACE FUNCTION firmaqr_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'FIRMAQR_IMMUTABLE: la tabla % es de solo inserción', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION firmaqr_forbid_change();
CREATE TRIGGER signatures_immutable BEFORE UPDATE OR DELETE ON "signatures"
  FOR EACH ROW EXECUTE FUNCTION firmaqr_forbid_change();
CREATE TRIGGER consent_records_immutable BEFORE UPDATE OR DELETE ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION firmaqr_forbid_change();

-- 3. Documentos definitivos: no se pueden modificar ni eliminar.
CREATE OR REPLACE FUNCTION firmaqr_documents_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.is_final THEN
    RAISE EXCEPTION 'FIRMAQR_IMMUTABLE: documento definitivo %', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER documents_guard BEFORE UPDATE OR DELETE ON "documents"
  FOR EACH ROW EXECUTE FUNCTION firmaqr_documents_guard();

-- 4. Registros de asistencia: solo se aceptan nuevos registros o avances de estado
--    mientras el evento está ACTIVO; un registro COMPLETADO solo admite la asignación
--    del consecutivo y la anulación justificada.
CREATE OR REPLACE FUNCTION firmaqr_attendance_guard() RETURNS trigger AS $$
DECLARE
  ev_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('COMPLETED', 'VOIDED') THEN
      RAISE EXCEPTION 'FIRMAQR_IMMUTABLE: no se puede eliminar un registro de asistencia firmado' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('STARTED','OTP_VERIFIED','COMPLETED')) THEN
    SELECT status::text INTO ev_status FROM events WHERE id = NEW.event_id FOR SHARE;
    IF ev_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'FIRMAQR_EVENT_CLOSED: el evento no admite registros (estado %)', ev_status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'COMPLETED' THEN
    IF NEW.status = 'VOIDED' AND NEW.void_reason IS NOT NULL AND NEW.voided_at IS NOT NULL THEN
      NULL; -- anulación justificada permitida
    ELSIF NEW.status <> 'COMPLETED' THEN
      RAISE EXCEPTION 'FIRMAQR_IMMUTABLE: transición de estado no permitida' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.evidence_hash IS DISTINCT FROM OLD.evidence_hash
       OR NEW.evidence_json IS DISTINCT FROM OLD.evidence_json
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.evidence_code IS DISTINCT FROM OLD.evidence_code
       OR NEW.attendee_id IS DISTINCT FROM OLD.attendee_id
       OR NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.document_number_hash IS DISTINCT FROM OLD.document_number_hash
       OR NEW.auth_method IS DISTINCT FROM OLD.auth_method
       OR NEW.otp_verified_at IS DISTINCT FROM OLD.otp_verified_at
       OR (OLD.sequence IS NOT NULL AND NEW.sequence IS DISTINCT FROM OLD.sequence) THEN
      RAISE EXCEPTION 'FIRMAQR_IMMUTABLE: la evidencia de un registro firmado no puede modificarse' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'VOIDED' THEN
    RAISE EXCEPTION 'FIRMAQR_IMMUTABLE: registro anulado' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_records_guard BEFORE INSERT OR UPDATE OR DELETE ON "attendance_records"
  FOR EACH ROW EXECUTE FUNCTION firmaqr_attendance_guard();

-- 5. Datos del participante congelados una vez firmado el registro.
CREATE OR REPLACE FUNCTION firmaqr_attendee_guard() RETURNS trigger AS $$
DECLARE
  rec_status text;
BEGIN
  SELECT status::text INTO rec_status FROM attendance_records WHERE attendee_id = OLD.id;
  IF rec_status IN ('COMPLETED', 'VOIDED') THEN
    RAISE EXCEPTION 'FIRMAQR_IMMUTABLE: datos de participante con registro firmado' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendees_guard BEFORE UPDATE OR DELETE ON "attendees"
  FOR EACH ROW EXECUTE FUNCTION firmaqr_attendee_guard();

-- 6. Eventos finalizados: los campos que aparecen en la evidencia quedan bloqueados.
CREATE OR REPLACE FUNCTION firmaqr_event_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'FINALIZED' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.program IS DISTINCT FROM OLD.program
       OR NEW.topic IS DISTINCT FROM OLD.topic
       OR NEW.related_document IS DISTINCT FROM OLD.related_document
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.trainer IS DISTINCT FROM OLD.trainer
       OR NEW.institution IS DISTINCT FROM OLD.institution
       OR NEW.classification IS DISTINCT FROM OLD.classification
       OR NEW.date IS DISTINCT FROM OLD.date
       OR NEW.start_time IS DISTINCT FROM OLD.start_time
       OR NEW.end_time IS DISTINCT FROM OLD.end_time
       OR NEW.duration_hours IS DISTINCT FROM OLD.duration_hours
       OR NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
      RAISE EXCEPTION 'FIRMAQR_IMMUTABLE: evento finalizado, campos de evidencia bloqueados' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER events_guard BEFORE UPDATE ON "events"
  FOR EACH ROW EXECUTE FUNCTION firmaqr_event_guard();
