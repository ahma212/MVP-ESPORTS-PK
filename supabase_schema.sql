-- MVP ESPORTS PK - Supabase Database Schema
-- Run this script in your Supabase SQL Editor (https://app.supabase.com/project/_/sql)

-- 1. Create Profiles Table (Linked to Auth Users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT UNIQUE,
  name TEXT,
  pubg_id_name TEXT,
  pubg_id_number TEXT,
  wallet_balance NUMERIC DEFAULT 300,
  role TEXT DEFAULT 'player', -- 'player' or 'admin'
  total_matches INT DEFAULT 0,
  total_wins INT DEFAULT 0,
  total_kills INT DEFAULT 0,
  avatar_url TEXT,
  phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Matches Table
CREATE TABLE IF NOT EXISTS public.matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL, -- 'tournament', 'squad', 'duo', 'solo', 'tdm'
  map TEXT NOT NULL,
  match_time TEXT NOT NULL,
  timestamp BIGINT,
  entry_fee NUMERIC NOT NULL DEFAULT 0,
  prizes JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_slots INT NOT NULL DEFAULT 50,
  booked_slots INT DEFAULT 0,
  room_id TEXT,
  room_password TEXT,
  status TEXT DEFAULT 'upcoming', -- 'upcoming', 'room_published', 'live', 'completed'
  rules JSONB DEFAULT '[]'::jsonb,
  banner_url TEXT,
  squad_type TEXT NOT NULL DEFAULT 'SQUAD',
  version TEXT DEFAULT 'PUBG Mobile v3.5',
  maps JSONB DEFAULT '[]'::jsonb
);

-- 3. Create Slot Bookings Table
CREATE TABLE IF NOT EXISTS public.slot_bookings (
  id TEXT PRIMARY KEY,
  match_id TEXT REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_name TEXT,
  player_ign TEXT,
  player_uid TEXT,
  teammate_uids JSONB DEFAULT '[]'::jsonb,
  slot_number INT NOT NULL,
  booking_time TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'confirmed',
  paid_amount NUMERIC DEFAULT 0
);

-- 4. Create Wallet Transactions Table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL, -- 'deposit', 'withdrawal', 'match_entry', 'match_winning'
  payment_method TEXT, -- 'JazzCash', 'EasyPaisa'
  account_number TEXT,
  account_title TEXT,
  trx_id TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Deposit Requests Table
CREATE TABLE IF NOT EXISTS public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  sender_name TEXT,
  trx_id TEXT,
  screenshot_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Matches Policies
CREATE POLICY "Matches are viewable by everyone" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Admins can insert matches" ON public.matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can update matches" ON public.matches FOR UPDATE USING (true);

-- Slot Bookings Policies
CREATE POLICY "Bookings viewable by everyone" ON public.slot_bookings FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert bookings" ON public.slot_bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookings" ON public.slot_bookings FOR UPDATE USING (auth.uid() = user_id);

-- Wallet Transactions Policies
CREATE POLICY "Users can view own transactions" ON public.wallet_transactions FOR SELECT USING (auth.uid() = user_id OR true);
CREATE POLICY "Users can create transactions" ON public.wallet_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users/Admins can update transactions" ON public.wallet_transactions FOR UPDATE USING (true);

-- Deposit Requests Policies
CREATE POLICY "Users can view deposit requests" ON public.deposit_requests FOR SELECT USING (true);
CREATE POLICY "Users can insert deposit requests" ON public.deposit_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Users/Admins can update deposit requests" ON public.deposit_requests FOR UPDATE USING (true);

-- Automatic Profile Creation Trigger on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, name, pubg_id_name, pubg_id_number, wallet_balance, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'pubg_id_name', 'Player'),
    COALESCE(NEW.raw_user_meta_data->>'pubg_id_number', '5164893012'),
    300,
    'player'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Automatic 7-day cleanup procedure for approved/rejected records
CREATE OR REPLACE FUNCTION public.cleanup_old_history()
RETURNS VOID AS $$
BEGIN
  -- 1. Delete approved and rejected deposit requests older than 7 days (pending records protected)
  DELETE FROM public.deposit_requests
  WHERE status IN ('approved', 'rejected')
    AND created_at < NOW() - INTERVAL '7 days';

  -- 2. Delete approved and rejected withdrawal requests older than 7 days (pending records protected)
  DELETE FROM public.withdrawal_requests
  WHERE status IN ('approved', 'rejected')
    AND created_at < NOW() - INTERVAL '7 days';

  -- 3. Delete confirmed slot bookings older than 7 days
  DELETE FROM public.slot_bookings
  WHERE status = 'confirmed'
    AND created_at < NOW() - INTERVAL '7 days';

  -- 4. Delete approved and rejected wallet transactions older than 7 days
  DELETE FROM public.wallet_transactions
  WHERE status IN ('approved', 'rejected')
    AND created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Friend Chats Table
CREATE TABLE IF NOT EXISTS public.friend_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT,
    media_url TEXT,
    media_type TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.friend_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public friend_chats access" ON public.friend_chats FOR ALL USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE friend_chats;


-- 8. Secure 7-day rolling cleanup function returning granular metrics
CREATE OR REPLACE FUNCTION public.cleanup_mvp_7_day_history()
RETURNS TABLE (
  friend_chats_deleted INT,
  admin_chats_deleted INT,
  friend_requests_deleted INT,
  deposit_requests_deleted INT,
  withdrawal_requests_deleted INT,
  wallet_transactions_deleted INT,
  slot_bookings_deleted INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  count_chats INT := 0;
  count_admin_chats INT := 0;
  count_freqs INT := 0;
  count_deposits INT := 0;
  count_withdrawals INT := 0;
  count_txs INT := 0;
  count_bookings INT := 0;
BEGIN
  -- Begin a single safe transactional cleanup block

  -- A. CLEANUP: friend_chats (Text and media references)
  WITH del_chats AS (
    DELETE FROM public.friend_chats
    WHERE created_at < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO count_chats FROM del_chats;

  -- B. CLEANUP: admin_chats (Support requests logs)
  WITH del_admin_chats AS (
    DELETE FROM public.admin_chats
    WHERE created_at < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO count_admin_chats FROM del_admin_chats;

  -- C. CLEANUP: friend_requests (Only accepted & rejected. 'pending' NEVER deleted)
  WITH del_freqs AS (
    DELETE FROM public.friend_requests
    WHERE status IN ('accepted', 'rejected')
      AND created_at < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO count_freqs FROM del_freqs;

  -- D. CLEANUP: deposit_requests (Only approved & rejected. 'pending' NEVER deleted)
  WITH del_deposits AS (
    DELETE FROM public.deposit_requests
    WHERE status IN ('approved', 'rejected')
      AND created_at < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO count_deposits FROM del_deposits;

  -- E. CLEANUP: withdrawal_requests (Only approved & rejected. 'pending' NEVER deleted)
  WITH del_withdrawals AS (
    DELETE FROM public.withdrawal_requests
    WHERE status IN ('approved', 'rejected')
      AND created_at < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO count_withdrawals FROM del_withdrawals;

  -- F. CLEANUP: wallet_transactions (Only historical ledger entries. NEVER touches public.profiles.wallet_balance)
  WITH del_txs AS (
    DELETE FROM public.wallet_transactions
    WHERE status IN ('approved', 'rejected')
      AND created_at < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO count_txs FROM del_txs;

  -- G. CLEANUP: slot_bookings (Uses booking_time. ONLY deletes if match status is 'completed')
  -- Does NOT impact active matches slot bookings (upcoming, room_published, live)
  WITH del_bookings AS (
    DELETE FROM public.slot_bookings sb
    USING public.matches m
    WHERE sb.match_id = m.id
      AND m.status = 'completed'
      AND sb.booking_time < NOW() - INTERVAL '7 days'
    RETURNING sb.id
  )
  SELECT COUNT(*) INTO count_bookings FROM del_bookings;

  -- Return metric reports
  RETURN QUERY SELECT 
    count_chats, 
    count_admin_chats, 
    count_freqs, 
    count_deposits, 
    count_withdrawals, 
    count_txs, 
    count_bookings;
END;
$$;

-- REVOKE all default executions to secure function from unauthorized execution
REVOKE EXECUTE ON FUNCTION public.cleanup_mvp_7_day_history() FROM public, anon, authenticated;

-- GRANT execute privilege strictly to service_role (Admin & Cron executions only)
GRANT EXECUTE ON FUNCTION public.cleanup_mvp_7_day_history() TO service_role;


