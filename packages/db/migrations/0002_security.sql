-- Role và quyền theo mục 7.11. Role tạo NOLOGIN; bật LOGIN + mật khẩu ngoài migration (packages/db/README.md).
-- dnw_migrator chính là role chạy migration, không tạo ở đây.
-- Mọi lệnh áp dụng cho schema hiện tại (current_schema()) để test chạy được trong schema riêng.
DO $$
DECLARE
  s text := current_schema();
  t text;
  api_tables text[];
  rt_read text[] := ARRAY['user_profiles','player_characters','avatars','landmarks','landmark_translations',
    'spawn_points','vehicle_types','vehicle_spawn_points','world_zones','map_chunks'];
  rt_write text[] := ARRAY['player_discoveries','player_progress','game_rooms'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dnw_api') THEN
    CREATE ROLE dnw_api NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dnw_realtime') THEN
    CREATE ROLE dnw_realtime NOLOGIN;
  END IF;

  -- Cho phép role đang chạy migration dùng SET ROLE (kiểm thử quyền); bỏ qua nếu bản PostgreSQL không hỗ trợ.
  BEGIN
    EXECUTE 'GRANT dnw_api TO CURRENT_USER WITH SET TRUE';
    EXECUTE 'GRANT dnw_realtime TO CURRENT_USER WITH SET TRUE';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  EXECUTE format('GRANT USAGE ON SCHEMA %I TO dnw_api, dnw_realtime', s);
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA extensions TO dnw_api, dnw_realtime';
  END IF;

  SELECT array_agg(tablename::text) INTO api_tables
  FROM pg_tables WHERE schemaname = s AND tablename <> '__drizzle_migrations';

  -- RLS bật cho mọi bảng: schema public của Supabase lộ ra Data API, không policy nghĩa là anon/authenticated không đọc được.
  -- Chủ bảng (role migration) bỏ qua RLS; hai role ứng dụng cần policy riêng.
  FOREACH t IN ARRAY api_tables LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO dnw_api', s, t);
    EXECUTE format('CREATE POLICY dnw_api_all ON %I.%I FOR ALL TO dnw_api USING (true) WITH CHECK (true)', s, t);
  END LOOP;

  -- dnw_realtime: chỉ đọc các bảng nội dung, không chạm auth_sessions, email_tokens, password_hash.
  EXECUTE format('GRANT SELECT (id, status) ON %I.users TO dnw_realtime', s);
  EXECUTE format('CREATE POLICY dnw_realtime_read ON %I.users FOR SELECT TO dnw_realtime USING (true)', s);

  FOREACH t IN ARRAY rt_read LOOP
    EXECUTE format('GRANT SELECT ON %I.%I TO dnw_realtime', s, t);
    EXECUTE format('CREATE POLICY dnw_realtime_read ON %I.%I FOR SELECT TO dnw_realtime USING (true)', s, t);
  END LOOP;

  -- UPDATE/ON CONFLICT cần SELECT trên cùng bảng.
  FOREACH t IN ARRAY rt_write LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I.%I TO dnw_realtime', s, t);
    EXECUTE format('CREATE POLICY dnw_realtime_rw ON %I.%I FOR ALL TO dnw_realtime USING (true) WITH CHECK (true)', s, t);
  END LOOP;

  -- Bảng tạo sau này trong schema này tự cấp quyền cho dnw_api (và chặn anon/authenticated trên Supabase).
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dnw_api', s);

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM anon', s);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM authenticated', s);
  END IF;
END
$$;