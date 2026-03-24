-- ============================================================
-- RentFlow - Full Database Schema
-- Supabase PostgreSQL
-- ============================================================
-- Safe to re-run: drops all existing tables, triggers, and
-- functions before recreating everything from scratch.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DROP EXISTING OBJECTS (safe re-run)
-- Drop in reverse dependency order so foreign keys don't block
-- ============================================================

-- Triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
DROP TRIGGER IF EXISTS trg_buildings_updated ON buildings;
DROP TRIGGER IF EXISTS trg_rooms_updated ON rooms;
DROP TRIGGER IF EXISTS trg_tenants_updated ON tenants;
DROP TRIGGER IF EXISTS trg_rent_updated ON rent_records;

-- Functions
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS mark_overdue_rents() CASCADE;

-- Tables (reverse dependency order)
DROP TABLE IF EXISTS notification_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS electricity_records CASCADE;
DROP TABLE IF EXISTS rent_records CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'tenant')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BUILDINGS
-- ============================================================
CREATE TABLE buildings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROOMS
-- ============================================================
CREATE TABLE rooms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  room_number TEXT NOT NULL,
  floor TEXT,
  rent_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date INTEGER NOT NULL DEFAULT 1, -- day of month (1-31)
  is_occupied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (building_id, room_number)
);

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE tenants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  whatsapp_number TEXT,
  id_proof_type TEXT,
  join_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RENT RECORDS
-- ============================================================
CREATE TABLE rent_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'overdue')),
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, month, year)
);

-- ============================================================
-- ELECTRICITY RECORDS
-- ============================================================
CREATE TABLE electricity_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  previous_reading NUMERIC(10,2) NOT NULL,
  current_reading NUMERIC(10,2) NOT NULL,
  units_consumed NUMERIC(10,2) GENERATED ALWAYS AS (current_reading - previous_reading) STORED,
  rate_per_unit NUMERIC(6,2) NOT NULL,
  total_amount NUMERIC(10,2) GENERATED ALWAYS AS ((current_reading - previous_reading) * rate_per_unit) STORED,
  reading_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (room_id, month, year)
);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('id_proof', 'rent_agreement', 'other')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,  -- Supabase Storage path
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WHATSAPP NOTIFICATION LOG
-- ============================================================
CREATE TABLE notification_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  rent_record_id UUID REFERENCES rent_records(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL, -- 'reminder_2days', 'due_today', 'overdue_1day', etc.
  message_body TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- IN-APP NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'overdue', 'payment')),
  is_read BOOLEAN DEFAULT FALSE,
  related_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  related_rent_id UUID REFERENCES rent_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE electricity_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read their own
CREATE POLICY "Users read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Buildings: owner full access; tenants read buildings they belong to
CREATE POLICY "Owner manages buildings" ON buildings FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Tenant reads their building" ON buildings FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.building_id = buildings.id AND tenants.user_id = auth.uid() AND tenants.is_active = TRUE)
);

-- Rooms: owner full access; tenants read their own room
CREATE POLICY "Owner manages rooms" ON rooms FOR ALL USING (
  EXISTS (SELECT 1 FROM buildings WHERE buildings.id = rooms.building_id AND buildings.owner_id = auth.uid())
);
CREATE POLICY "Tenant reads own room" ON rooms FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.room_id = rooms.id AND tenants.user_id = auth.uid() AND tenants.is_active = TRUE)
);

-- Tenants: owner full access; tenant reads own record
CREATE POLICY "Owner manages tenants" ON tenants FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Tenant reads own record" ON tenants FOR SELECT USING (user_id = auth.uid());

-- Rent records: owner full access; tenant reads own
CREATE POLICY "Owner manages rent" ON rent_records FOR ALL USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = rent_records.tenant_id AND tenants.owner_id = auth.uid())
);
CREATE POLICY "Tenant reads own rent" ON rent_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = rent_records.tenant_id AND tenants.user_id = auth.uid())
);

-- Electricity: owner full access; tenant reads own room's records
CREATE POLICY "Owner manages electricity" ON electricity_records FOR ALL USING (
  EXISTS (SELECT 1 FROM buildings WHERE buildings.id = electricity_records.building_id AND buildings.owner_id = auth.uid())
);
CREATE POLICY "Tenant reads own electricity" ON electricity_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = electricity_records.tenant_id AND tenants.user_id = auth.uid())
);

-- Documents: owner full access; tenant reads/uploads own docs
CREATE POLICY "Owner manages documents" ON documents FOR ALL USING (
  EXISTS (SELECT 1 FROM buildings WHERE buildings.id = documents.building_id AND buildings.owner_id = auth.uid())
);
CREATE POLICY "Tenant reads own documents" ON documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = documents.tenant_id AND tenants.user_id = auth.uid())
);
CREATE POLICY "Tenant uploads own documents" ON documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = documents.tenant_id AND tenants.user_id = auth.uid())
  AND doc_type = 'id_proof'
);

-- Notifications: users read their own
CREATE POLICY "Users read own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- Notification logs: owner reads
CREATE POLICY "Owner reads notification logs" ON notification_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants WHERE tenants.id = notification_logs.tenant_id AND tenants.owner_id = auth.uid())
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_buildings_updated BEFORE UPDATE ON buildings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rooms_updated BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rent_updated BEFORE UPDATE ON rent_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'tenant')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto mark overdue rents
CREATE OR REPLACE FUNCTION mark_overdue_rents()
RETURNS void AS $$
BEGIN
  UPDATE rent_records
  SET status = 'overdue'
  WHERE status = 'unpaid' AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STORAGE BUCKETS (run via Supabase Dashboard or API)
-- ============================================================
-- Create buckets: 'tenant-documents' with RLS policies
-- INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-documents', 'tenant-documents', false);
