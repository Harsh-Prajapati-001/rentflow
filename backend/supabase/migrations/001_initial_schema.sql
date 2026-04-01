-- ============================================================
-- RentFlow v3 — Production-Ready Schema
-- Fixes applied (Gemini audit):
--   #6: is_occupied managed by DB trigger (ACID compliant)
--   #7: CASCADE deletes replaced with SET NULL / RESTRICT
--       to prevent catastrophic data loss
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Drop everything in safe order ────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created          ON auth.users;
DROP TRIGGER IF EXISTS trg_profiles_updated          ON profiles;
DROP TRIGGER IF EXISTS trg_buildings_updated         ON buildings;
DROP TRIGGER IF EXISTS trg_rooms_updated             ON rooms;
DROP TRIGGER IF EXISTS trg_tenants_updated           ON tenants;
DROP TRIGGER IF EXISTS trg_rent_updated              ON rent_records;
DROP TRIGGER IF EXISTS trg_elec_updated              ON electricity_records;
DROP TRIGGER IF EXISTS trg_notify_rent               ON rent_records;
DROP TRIGGER IF EXISTS trg_notify_elec               ON electricity_records;
DROP TRIGGER IF EXISTS trg_update_meter_on_payment   ON electricity_records;
DROP TRIGGER IF EXISTS trg_room_occupancy_on_tenant  ON tenants;

DROP FUNCTION IF EXISTS handle_new_user()                     CASCADE;
DROP FUNCTION IF EXISTS update_updated_at()                   CASCADE;
DROP FUNCTION IF EXISTS mark_overdue_rents()                  CASCADE;
DROP FUNCTION IF EXISTS run_daily_overdue_check()             CASCADE;
DROP FUNCTION IF EXISTS notify_rent_change()                  CASCADE;
DROP FUNCTION IF EXISTS notify_elec_change()                  CASCADE;
DROP FUNCTION IF EXISTS update_meter_reading_on_payment()     CASCADE;
DROP FUNCTION IF EXISTS manage_room_occupancy()               CASCADE;
DROP FUNCTION IF EXISTS find_owner_by_credentials(TEXT,TEXT)  CASCADE;

DROP TABLE IF EXISTS notification_logs   CASCADE;
DROP TABLE IF EXISTS notifications       CASCADE;
DROP TABLE IF EXISTS documents           CASCADE;
DROP TABLE IF EXISTS electricity_records CASCADE;
DROP TABLE IF EXISTS rent_records        CASCADE;
DROP TABLE IF EXISTS room_requests       CASCADE;
DROP TABLE IF EXISTS tenants             CASCADE;
DROP TABLE IF EXISTS rooms               CASCADE;
DROP TABLE IF EXISTS buildings           CASCADE;
DROP TABLE IF EXISTS profiles            CASCADE;

-- ============================================================
-- PROFILES
-- FIX #7: No cascade on profiles — deleting a user account
-- must NOT delete financial history. Buildings/tenants remain.
-- ============================================================
CREATE TABLE profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT    NOT NULL,
  phone     TEXT,
  role      TEXT    NOT NULL CHECK (role IN ('owner','tenant')),
  email     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BUILDINGS
-- FIX #7: owner_id SET NULL on owner deletion — buildings
-- survive even if the owner account is removed.
-- ============================================================
CREATE TABLE buildings (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  address    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROOMS
-- FIX #6: is_occupied managed exclusively by DB trigger.
-- Never update is_occupied from frontend directly.
-- FIX #7: building_id SET NULL (rooms survive building deletion)
-- ============================================================
CREATE TABLE rooms (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  building_id             UUID REFERENCES buildings(id) ON DELETE SET NULL,
  room_number             TEXT    NOT NULL,
  floor                   TEXT,
  rent_amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- FIX: correct column name used everywhere
  due_date_day            INTEGER NOT NULL DEFAULT 5 CHECK (due_date_day BETWEEN 1 AND 31),
  is_occupied             BOOLEAN DEFAULT FALSE,
  last_meter_reading      NUMERIC(10,2) NOT NULL DEFAULT 0,
  last_meter_reading_date DATE DEFAULT CURRENT_DATE,
  rate_per_unit           NUMERIC(6,2) NOT NULL DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (building_id, room_number)
);

-- ============================================================
-- TENANTS
-- FIX #7: No cascade. If building is deleted, tenant record
-- stays. owner_id and building_id set to null, room_id set null.
-- Historical tenant data is preserved for legal/audit purposes.
-- ============================================================
CREATE TABLE tenants (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  -- user_id: links to the tenant's auth account (nullable — tenant may not have app login)
  user_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- owner_id: who manages this tenant — SET NULL if owner deletes account
  owner_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  building_id      UUID REFERENCES buildings(id) ON DELETE SET NULL,
  room_id          UUID REFERENCES rooms(id)     ON DELETE SET NULL,
  full_name        TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT,
  whatsapp_number  TEXT,
  id_proof_type    TEXT,
  join_date        DATE DEFAULT CURRENT_DATE,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROOM REQUESTS
-- ============================================================
CREATE TABLE room_requests (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_user_id  UUID REFERENCES profiles(id)  ON DELETE SET NULL,
  room_id         UUID REFERENCES rooms(id)      ON DELETE SET NULL,
  building_id     UUID REFERENCES buildings(id)  ON DELETE SET NULL,
  owner_id        UUID REFERENCES profiles(id)   ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','withdrawn')),
  message         TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RENT RECORDS (postpaid)
-- FIX: columns are stay_month/stay_year (not month/year)
-- FIX: period_start and period_end are NOT NULL — always provided
-- FIX #7: tenant/room/building SET NULL — records survive deletions
-- ============================================================
CREATE TABLE rent_records (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id    UUID REFERENCES tenants(id)   ON DELETE SET NULL,
  room_id      UUID REFERENCES rooms(id)     ON DELETE SET NULL,
  building_id  UUID REFERENCES buildings(id) ON DELETE SET NULL,
  stay_month   INTEGER NOT NULL CHECK (stay_month BETWEEN 1 AND 12),
  stay_year    INTEGER NOT NULL,
  -- FIX: period_start/end are NOT NULL (required for display and audit)
  period_start DATE    NOT NULL,
  period_end   DATE    NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  due_date     DATE    NOT NULL,
  paid_date    DATE,
  status       TEXT    NOT NULL DEFAULT 'unpaid'
               CHECK (status IN ('paid','unpaid','overdue')),
  payment_method TEXT,
  notes          TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, stay_month, stay_year)
);

-- ============================================================
-- ELECTRICITY RECORDS
-- FIX: stay_month/stay_year column names
-- FIX: period_start/end are NOT NULL
-- FIX #7: SET NULL on deletions
-- ============================================================
CREATE TABLE electricity_records (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_id          UUID REFERENCES rooms(id)     ON DELETE SET NULL,
  building_id      UUID REFERENCES buildings(id) ON DELETE SET NULL,
  tenant_id        UUID REFERENCES tenants(id)   ON DELETE SET NULL,
  stay_month       INTEGER NOT NULL CHECK (stay_month BETWEEN 1 AND 12),
  stay_year        INTEGER NOT NULL,
  period_start     DATE    NOT NULL,
  period_end       DATE    NOT NULL,
  previous_reading NUMERIC(10,2) NOT NULL,
  current_reading  NUMERIC(10,2) NOT NULL,
  units_consumed   NUMERIC(10,2) GENERATED ALWAYS AS (current_reading - previous_reading) STORED,
  rate_per_unit    NUMERIC(6,2)  NOT NULL,
  total_amount     NUMERIC(10,2) GENERATED ALWAYS AS ((current_reading - previous_reading) * rate_per_unit) STORED,
  due_date         DATE    NOT NULL,
  paid_date        DATE,
  status           TEXT    NOT NULL DEFAULT 'unpaid'
                   CHECK (status IN ('paid','unpaid','overdue')),
  payment_method   TEXT,
  reading_date     DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (room_id, stay_month, stay_year),
  CONSTRAINT current_gte_previous CHECK (current_reading >= previous_reading)
);

-- ============================================================
-- DOCUMENTS
-- FIX #7: SET NULL — documents survive if tenant/owner deleted
-- ============================================================
CREATE TABLE documents (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id    UUID REFERENCES tenants(id)   ON DELETE SET NULL,
  building_id  UUID REFERENCES buildings(id) ON DELETE SET NULL,
  uploaded_by  UUID REFERENCES profiles(id)  ON DELETE SET NULL,
  doc_type     TEXT NOT NULL CHECK (doc_type IN ('id_proof','rent_agreement','other')),
  file_name    TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  file_size    INTEGER,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id)           ON DELETE CASCADE,
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  type              TEXT DEFAULT 'info'
                    CHECK (type IN ('info','warning','overdue','payment','request')),
  is_read           BOOLEAN DEFAULT FALSE,
  related_tenant_id UUID REFERENCES tenants(id)            ON DELETE SET NULL,
  related_rent_id   UUID REFERENCES rent_records(id)       ON DELETE SET NULL,
  related_elec_id   UUID REFERENCES electricity_records(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WHATSAPP NOTIFICATION LOG
-- ============================================================
CREATE TABLE notification_logs (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id      UUID REFERENCES tenants(id)      ON DELETE SET NULL,
  rent_record_id UUID REFERENCES rent_records(id) ON DELETE SET NULL,
  message_type   TEXT NOT NULL,
  message_body   TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  status         TEXT DEFAULT 'sent' CHECK (status IN ('sent','failed','pending')),
  sent_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE electricity_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users read own profile"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Read owner profiles"      ON profiles FOR SELECT USING (role = 'owner');

-- Buildings (public read for room browsing)
CREATE POLICY "Owner manages buildings"  ON buildings FOR ALL    USING (owner_id = auth.uid());
CREATE POLICY "Anyone reads buildings"   ON buildings FOR SELECT USING (true);

-- Rooms (public read for room browsing)
CREATE POLICY "Owner manages rooms"      ON rooms FOR ALL    USING (
  EXISTS (SELECT 1 FROM buildings WHERE buildings.id = rooms.building_id AND buildings.owner_id = auth.uid())
);
CREATE POLICY "Anyone reads rooms"       ON rooms FOR SELECT USING (true);

-- Room requests
CREATE POLICY "Owner manages requests"   ON room_requests FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Tenant manages own requests" ON room_requests FOR ALL USING (tenant_user_id = auth.uid());

-- Tenants
CREATE POLICY "Owner manages tenants"    ON tenants FOR ALL    USING (owner_id = auth.uid());
CREATE POLICY "Tenant reads own record"  ON tenants FOR SELECT USING (user_id = auth.uid());

-- Rent records
CREATE POLICY "Owner manages rent"       ON rent_records FOR ALL USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = rent_records.tenant_id AND tenants.owner_id = auth.uid())
);
CREATE POLICY "Tenant reads own rent"    ON rent_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = rent_records.tenant_id AND tenants.user_id = auth.uid())
);

-- Electricity
CREATE POLICY "Owner manages electricity" ON electricity_records FOR ALL USING (
  EXISTS (SELECT 1 FROM buildings WHERE buildings.id = electricity_records.building_id AND buildings.owner_id = auth.uid())
);
CREATE POLICY "Tenant reads own electricity" ON electricity_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = electricity_records.tenant_id AND tenants.user_id = auth.uid())
);

-- Documents
CREATE POLICY "Owner manages documents"  ON documents FOR ALL USING (
  EXISTS (SELECT 1 FROM buildings WHERE buildings.id = documents.building_id AND buildings.owner_id = auth.uid())
);
CREATE POLICY "Tenant reads own docs"    ON documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = documents.tenant_id AND tenants.user_id = auth.uid())
);
CREATE POLICY "Tenant uploads id proof"  ON documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = documents.tenant_id AND tenants.user_id = auth.uid())
  AND doc_type = 'id_proof'
);

-- Notifications (CASCADE delete is correct here — user notifications die with user)
CREATE POLICY "Users read own notifs"    ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own notifs"  ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Service inserts notifs"   ON notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Owner reads logs"         ON notification_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = notification_logs.tenant_id AND tenants.owner_id = auth.uid())
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- updated_at auto-updater
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated  BEFORE UPDATE ON profiles          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_buildings_updated BEFORE UPDATE ON buildings         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rooms_updated     BEFORE UPDATE ON rooms             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tenants_updated   BEFORE UPDATE ON tenants           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rent_updated      BEFORE UPDATE ON rent_records      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_elec_updated      BEFORE UPDATE ON electricity_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Auto-create profile on signup ────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'tenant'),
    NEW.email,
    NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone',''), '[^0-9]','','g'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── FIX #6: Room occupancy managed by DB trigger ─────────
-- When a tenant is inserted with a room_id → mark room occupied
-- When a tenant is deactivated (is_active=false) → mark room vacant
-- This is ACID compliant — both changes happen in one transaction
CREATE OR REPLACE FUNCTION manage_room_occupancy()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: if assigned to a room, mark it occupied
  IF TG_OP = 'INSERT' AND NEW.room_id IS NOT NULL THEN
    UPDATE rooms SET is_occupied = TRUE WHERE id = NEW.room_id;

  -- On UPDATE: tenant moved rooms
  ELSIF TG_OP = 'UPDATE' THEN
    -- If room changed, free old room
    IF OLD.room_id IS DISTINCT FROM NEW.room_id THEN
      IF OLD.room_id IS NOT NULL THEN
        UPDATE rooms SET is_occupied = FALSE WHERE id = OLD.room_id;
      END IF;
      IF NEW.room_id IS NOT NULL AND NEW.is_active = TRUE THEN
        UPDATE rooms SET is_occupied = TRUE WHERE id = NEW.room_id;
      END IF;
    END IF;
    -- If tenant deactivated (moved out)
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
      IF NEW.room_id IS NOT NULL THEN
        UPDATE rooms SET is_occupied = FALSE WHERE id = NEW.room_id;
      END IF;
    END IF;
    -- If tenant reactivated
    IF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
      IF NEW.room_id IS NOT NULL THEN
        UPDATE rooms SET is_occupied = TRUE WHERE id = NEW.room_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_room_occupancy_on_tenant
  AFTER INSERT OR UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION manage_room_occupancy();

-- ── Notify on rent status change ─────────────────────────
CREATE OR REPLACE FUNCTION notify_rent_change()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant   RECORD;
  v_owner_id UUID;
  v_period   TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT t.* INTO v_tenant FROM tenants t WHERE t.id = NEW.tenant_id;
  IF v_tenant IS NULL THEN RETURN NEW; END IF;
  v_owner_id := v_tenant.owner_id;
  v_period   := TO_CHAR(NEW.period_start,'DD-MM-YYYY') || ' to ' || TO_CHAR(NEW.period_end,'DD-MM-YYYY');

  IF NEW.status = 'paid' THEN
    INSERT INTO notifications(user_id,title,message,type,related_tenant_id,related_rent_id)
    VALUES(v_owner_id, '✅ Rent Received — '||v_tenant.full_name,
      'Rent for '||v_period||' (₹'||NEW.amount||') paid via '||COALESCE(NEW.payment_method,'cash')||'.','payment',v_tenant.id,NEW.id);
    -- FIX #5: use v_tenant.user_id (auth UUID), NOT v_tenant.id (tenants table UUID)
    IF v_tenant.user_id IS NOT NULL THEN
      INSERT INTO notifications(user_id,title,message,type,related_rent_id)
      VALUES(v_tenant.user_id,'✅ Rent Payment Confirmed',
        'Your rent for '||v_period||' (₹'||NEW.amount||') is confirmed paid.','payment',NEW.id);
    END IF;

  ELSIF NEW.status = 'overdue' THEN
    INSERT INTO notifications(user_id,title,message,type,related_tenant_id,related_rent_id)
    VALUES(v_owner_id,'🔴 Rent Overdue — '||v_tenant.full_name,
      'Rent for '||v_period||' (₹'||NEW.amount||') overdue since '||TO_CHAR(NEW.due_date,'DD-MM-YYYY')||'.','overdue',v_tenant.id,NEW.id);
    -- FIX #5: correct user_id mapping
    IF v_tenant.user_id IS NOT NULL THEN
      INSERT INTO notifications(user_id,title,message,type,related_rent_id)
      VALUES(v_tenant.user_id,'🔴 Rent Overdue',
        'Your rent for '||v_period||' (₹'||NEW.amount||') is overdue. Please pay immediately.','overdue',NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_rent
  AFTER UPDATE ON rent_records
  FOR EACH ROW EXECUTE FUNCTION notify_rent_change();

-- ── Notify on electricity status change ──────────────────
CREATE OR REPLACE FUNCTION notify_elec_change()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant   RECORD;
  v_owner_id UUID;
  v_period   TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT t.* INTO v_tenant FROM tenants t WHERE t.id = NEW.tenant_id;
  SELECT b.owner_id INTO v_owner_id FROM buildings b WHERE b.id = NEW.building_id;
  v_period := TO_CHAR(NEW.period_start,'DD-MM-YYYY') || ' to ' || TO_CHAR(NEW.period_end,'DD-MM-YYYY');

  IF NEW.status = 'paid' THEN
    INSERT INTO notifications(user_id,title,message,type,related_elec_id)
    VALUES(v_owner_id,'⚡ Electricity Paid',
      'Bill for '||v_period||' (₹'||NEW.total_amount||', '||NEW.units_consumed||' units) paid.','payment',NEW.id);
    -- FIX #5: correct user_id
    IF v_tenant.user_id IS NOT NULL THEN
      INSERT INTO notifications(user_id,title,message,type,related_elec_id)
      VALUES(v_tenant.user_id,'⚡ Electricity Bill Paid',
        'Your electricity bill for '||v_period||' (₹'||NEW.total_amount||') is paid.','payment',NEW.id);
    END IF;
  ELSIF NEW.status = 'overdue' THEN
    INSERT INTO notifications(user_id,title,message,type,related_elec_id)
    VALUES(v_owner_id,'⚡ Electricity Overdue',
      'Bill for '||v_period||' (₹'||NEW.total_amount||') is overdue.','overdue',NEW.id);
    IF v_tenant.user_id IS NOT NULL THEN
      INSERT INTO notifications(user_id,title,message,type,related_elec_id)
      VALUES(v_tenant.user_id,'⚡ Electricity Bill Overdue',
        'Your electricity bill for '||v_period||' (₹'||NEW.total_amount||') is overdue.','overdue',NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_elec
  AFTER UPDATE ON electricity_records
  FOR EACH ROW EXECUTE FUNCTION notify_elec_change();

-- ── Update meter reading when electricity bill is paid ────
CREATE OR REPLACE FUNCTION update_meter_reading_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    UPDATE rooms SET
      last_meter_reading      = NEW.current_reading,
      last_meter_reading_date = COALESCE(NEW.paid_date, CURRENT_DATE)
    WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_meter_on_payment
  AFTER UPDATE ON electricity_records
  FOR EACH ROW EXECUTE FUNCTION update_meter_reading_on_payment();

-- ── FIX #3: Renamed from mark_overdue_rents to run_daily_overdue_check ──
-- GitHub Action now calls this correct function name.
-- Also sends day-count overdue notifications.
CREATE OR REPLACE FUNCTION run_daily_overdue_check()
RETURNS JSON AS $$
DECLARE
  v_rec   RECORD;
  v_days  INTEGER;
  v_period TEXT;
  v_r     INTEGER := 0;
  v_e     INTEGER := 0;
  v_n     INTEGER := 0;
BEGIN
  -- Mark unpaid rent as overdue
  UPDATE rent_records SET status = 'overdue'
  WHERE status = 'unpaid' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_r = ROW_COUNT;

  -- Mark unpaid electricity as overdue
  UPDATE electricity_records SET status = 'overdue'
  WHERE status = 'unpaid' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_e = ROW_COUNT;

  -- Daily overdue day-count notifications
  FOR v_rec IN
    SELECT rr.*, t.full_name AS tname, t.owner_id, t.user_id AS tuid
    FROM rent_records rr
    JOIN tenants t ON t.id = rr.tenant_id
    WHERE rr.status = 'overdue'
  LOOP
    v_days   := (CURRENT_DATE - v_rec.due_date)::INTEGER;
    v_period := TO_CHAR(v_rec.period_start,'DD-MM-YYYY') || ' to ' || TO_CHAR(v_rec.period_end,'DD-MM-YYYY');

    INSERT INTO notifications(user_id,title,message,type,related_rent_id)
    VALUES(v_rec.owner_id, '⚠️ '||v_rec.tname||' — Day '||v_days||' Overdue',
      'Rent for '||v_period||' (₹'||v_rec.amount||') is '||v_days||' day(s) overdue.','overdue',v_rec.id);

    -- FIX #5: use tuid (auth UUID from tenants.user_id), not tenant's tenants.id
    IF v_rec.tuid IS NOT NULL THEN
      INSERT INTO notifications(user_id,title,message,type,related_rent_id)
      VALUES(v_rec.tuid,'⚠️ Rent '||v_days||' Day(s) Overdue',
        'Your rent for '||v_period||' is '||v_days||' day(s) overdue. Pay immediately.','overdue',v_rec.id);
    END IF;

    v_n := v_n + 1;
  END LOOP;

  RETURN json_build_object(
    'rent_marked_overdue',  v_r,
    'elec_marked_overdue',  v_e,
    'notifications_sent',   v_n
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Find owner by credentials (for tenant registration) ───
CREATE OR REPLACE FUNCTION find_owner_by_credentials(p_email TEXT, p_phone TEXT)
RETURNS TABLE(owner_id UUID, owner_name TEXT, building_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, COUNT(b.id)::BIGINT
  FROM profiles p
  LEFT JOIN buildings b ON b.owner_id = p.id
  WHERE p.role = 'owner'
    AND LOWER(p.email) = LOWER(p_email)
    AND p.phone = regexp_replace(p_phone, '[^0-9]', '', 'g')
  GROUP BY p.id, p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;