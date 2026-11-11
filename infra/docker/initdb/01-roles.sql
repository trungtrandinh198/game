-- Chỉ chạy lần đầu khi volume rỗng. Mật khẩu dev; production dùng bí mật riêng (mục 14.7).
CREATE ROLE dnw_migrator LOGIN PASSWORD 'dnw_migrator_dev';
CREATE ROLE dnw_api LOGIN PASSWORD 'dnw_api_dev';
CREATE ROLE dnw_realtime LOGIN PASSWORD 'dnw_realtime_dev';

CREATE DATABASE dnw_test OWNER dnw_migrator;
ALTER DATABASE dnw OWNER TO dnw_migrator;

\connect dnw
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT CONNECT ON DATABASE dnw TO dnw_api, dnw_realtime;
GRANT USAGE ON SCHEMA public TO dnw_api, dnw_realtime;

\connect dnw_test
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT CONNECT ON DATABASE dnw_test TO dnw_api, dnw_realtime;
GRANT USAGE ON SCHEMA public TO dnw_api, dnw_realtime;

-- Quyền chi tiết theo bảng (mục 7.11) do packages/db áp dụng sau khi migrate (T05).
