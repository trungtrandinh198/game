CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" char(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "email_tokens_type_check" CHECK (type IN ('verify_email','reset_password'))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"description" text,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(32) NOT NULL,
	"display_name_key" varchar(32) NOT NULL,
	"locale" varchar(5) DEFAULT 'vi' NOT NULL,
	"country_code" char(2),
	"bio" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_locale_check" CHECK (locale IN ('vi','en'))
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_check" CHECK (status IN ('pending','active','suspended','banned'))
);
--> statement-breakpoint
CREATE TABLE "avatars" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(80) NOT NULL,
	"gender" varchar(20) NOT NULL,
	"rig" varchar(50) NOT NULL,
	"model_key" text NOT NULL,
	"thumbnail_key" text NOT NULL,
	"animation_set" varchar(100) NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avatars_code_unique" UNIQUE("code"),
	CONSTRAINT "avatars_gender_check" CHECK (gender IN ('male','female'))
);
--> statement-breakpoint
CREATE TABLE "player_characters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"avatar_id" uuid NOT NULL,
	"character_name" varchar(32),
	"appearance_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_characters_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "map_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_id" uuid NOT NULL,
	"chunk_code" varchar(40) NOT NULL,
	"grid_x" integer NOT NULL,
	"grid_z" integer NOT NULL,
	"bounds" geometry(Polygon, 4326) NOT NULL,
	"asset_manifest_key" text NOT NULL,
	"collision_key" text NOT NULL,
	"size_bytes" integer,
	"version" integer NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_chunks_zone_id_chunk_code_version_key" UNIQUE("zone_id","chunk_code","version"),
	CONSTRAINT "map_chunks_status_check" CHECK (status IN ('draft','published'))
);
--> statement-breakpoint
CREATE TABLE "spawn_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_id" uuid NOT NULL,
	"position" geometry(Point, 4326) NOT NULL,
	"local_x" real NOT NULL,
	"local_z" real NOT NULL,
	"rotation_y" real DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_occupancy" integer
);
--> statement-breakpoint
CREATE TABLE "world_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(150) NOT NULL,
	"boundary" geometry(MultiPolygon, 4326) NOT NULL,
	"origin_lon" double precision NOT NULL,
	"origin_lat" double precision NOT NULL,
	"crs" varchar(20) DEFAULT 'EPSG:32649' NOT NULL,
	"chunk_size_m" integer DEFAULT 256 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"map_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_zones_code_unique" UNIQUE("code"),
	CONSTRAINT "world_zones_chunk_size_check" CHECK ("world_zones"."chunk_size_m" BETWEEN 64 AND 1024),
	CONSTRAINT "world_zones_status_check" CHECK (status IN ('draft','active','disabled'))
);
--> statement-breakpoint
CREATE TABLE "vehicle_spawn_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_id" uuid NOT NULL,
	"vehicle_type_id" uuid NOT NULL,
	"code" varchar(80) NOT NULL,
	"position" geometry(Point, 4326) NOT NULL,
	"local_x" real NOT NULL,
	"local_z" real NOT NULL,
	"heading_y" real DEFAULT 0 NOT NULL,
	"respawn_seconds" integer DEFAULT 120 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_spawn_points_zone_id_code_key" UNIQUE("zone_id","code"),
	CONSTRAINT "vehicle_spawn_points_respawn_check" CHECK ("vehicle_spawn_points"."respawn_seconds" >= 30)
);
--> statement-breakpoint
CREATE TABLE "vehicle_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(80) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"model_key" text NOT NULL,
	"thumbnail_key" text,
	"config" jsonb NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_types_code_unique" UNIQUE("code"),
	CONSTRAINT "vehicle_types_kind_check" CHECK (kind IN ('bicycle','motorbike','car'))
);
--> statement-breakpoint
CREATE TABLE "landmark_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(80) NOT NULL,
	"icon" varchar(80),
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "landmark_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "landmark_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"landmark_id" uuid NOT NULL,
	"media_type" varchar(10) NOT NULL,
	"storage_key" text NOT NULL,
	"alt_text" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"copyright_credit" text NOT NULL,
	"license" text NOT NULL,
	"source_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landmark_media_type_check" CHECK (media_type IN ('image','video'))
);
--> statement-breakpoint
CREATE TABLE "landmark_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"landmark_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landmark_translations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"landmark_id" uuid NOT NULL,
	"locale" varchar(5) NOT NULL,
	"name" varchar(200) NOT NULL,
	"short_description" varchar(500) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"address_text" varchar(300),
	"historical_note" text,
	"review_status" varchar(20) DEFAULT 'draft' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landmark_translations_landmark_id_locale_key" UNIQUE("landmark_id","locale"),
	CONSTRAINT "landmark_translations_locale_check" CHECK (locale IN ('vi','en')),
	CONSTRAINT "landmark_translations_review_status_check" CHECK (review_status IN ('draft','reviewed'))
);
--> statement-breakpoint
CREATE TABLE "landmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"local_x" real NOT NULL,
	"local_z" real NOT NULL,
	"interaction_radius_m" real DEFAULT 25 NOT NULL,
	"cover_image_key" text,
	"model_key" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landmarks_code_unique" UNIQUE("code"),
	CONSTRAINT "landmarks_interaction_radius_check" CHECK ("landmarks"."interaction_radius_m" > 0 AND "landmarks"."interaction_radius_m" <= 200),
	CONSTRAINT "landmarks_status_check" CHECK (status IN ('draft','published','archived'))
);
--> statement-breakpoint
CREATE TABLE "game_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_id" uuid NOT NULL,
	"room_code" varchar(100) NOT NULL,
	"capacity" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"server_instance" varchar(100) NOT NULL,
	"peak_players" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "game_rooms_room_code_unique" UNIQUE("room_code"),
	CONSTRAINT "game_rooms_status_check" CHECK (status IN ('active','draining','closed'))
);
--> statement-breakpoint
CREATE TABLE "player_discoveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"landmark_id" uuid NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_discoveries_user_id_landmark_id_key" UNIQUE("user_id","landmark_id")
);
--> statement-breakpoint
CREATE TABLE "player_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_zone_id" uuid,
	"last_landmark_id" uuid,
	"last_local_x" real,
	"last_local_z" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" char(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_moderation_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"moderator_id" uuid,
	"action_type" varchar(20) NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_moderation_actions_action_check" CHECK (action_type IN ('mute','kick','suspend','ban','unban'))
);
--> statement-breakpoint
CREATE TABLE "user_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reported_user_id" uuid NOT NULL,
	"reason_code" varchar(50) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "user_reports_status_check" CHECK (status IN ('open','reviewing','resolved','rejected'))
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_characters" ADD CONSTRAINT "player_characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_characters" ADD CONSTRAINT "player_characters_avatar_id_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_chunks" ADD CONSTRAINT "map_chunks_zone_id_world_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."world_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spawn_points" ADD CONSTRAINT "spawn_points_zone_id_world_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."world_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_spawn_points" ADD CONSTRAINT "vehicle_spawn_points_zone_id_world_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."world_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_spawn_points" ADD CONSTRAINT "vehicle_spawn_points_vehicle_type_id_vehicle_types_id_fk" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landmark_media" ADD CONSTRAINT "landmark_media_landmark_id_landmarks_id_fk" FOREIGN KEY ("landmark_id") REFERENCES "public"."landmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landmark_revisions" ADD CONSTRAINT "landmark_revisions_landmark_id_landmarks_id_fk" FOREIGN KEY ("landmark_id") REFERENCES "public"."landmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landmark_revisions" ADD CONSTRAINT "landmark_revisions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landmark_translations" ADD CONSTRAINT "landmark_translations_landmark_id_landmarks_id_fk" FOREIGN KEY ("landmark_id") REFERENCES "public"."landmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landmark_translations" ADD CONSTRAINT "landmark_translations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landmarks" ADD CONSTRAINT "landmarks_zone_id_world_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."world_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landmarks" ADD CONSTRAINT "landmarks_category_id_landmark_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."landmark_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landmarks" ADD CONSTRAINT "landmarks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landmarks" ADD CONSTRAINT "landmarks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rooms" ADD CONSTRAINT "game_rooms_zone_id_world_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."world_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_discoveries" ADD CONSTRAINT "player_discoveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_discoveries" ADD CONSTRAINT "player_discoveries_landmark_id_landmarks_id_fk" FOREIGN KEY ("landmark_id") REFERENCES "public"."landmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_last_zone_id_world_zones_id_fk" FOREIGN KEY ("last_zone_id") REFERENCES "public"."world_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_last_landmark_id_landmarks_id_fk" FOREIGN KEY ("last_landmark_id") REFERENCES "public"."landmarks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_moderation_actions" ADD CONSTRAINT "user_moderation_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_moderation_actions" ADD CONSTRAINT "user_moderation_actions_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id") WHERE "auth_sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "email_tokens_user_type_idx" ON "email_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_display_name_key_uq" ON "user_profiles" USING btree ("display_name_key");--> statement-breakpoint
CREATE INDEX "user_profiles_display_name_trgm_idx" ON "user_profiles" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "map_chunks_bounds_gix" ON "map_chunks" USING gist ("bounds");--> statement-breakpoint
CREATE INDEX "map_chunks_zone_status_idx" ON "map_chunks" USING btree ("zone_id","status");--> statement-breakpoint
CREATE INDEX "spawn_points_zone_idx" ON "spawn_points" USING btree ("zone_id") WHERE "spawn_points"."is_active";--> statement-breakpoint
CREATE INDEX "world_zones_boundary_gix" ON "world_zones" USING gist ("boundary");--> statement-breakpoint
CREATE INDEX "vehicle_spawn_points_zone_idx" ON "vehicle_spawn_points" USING btree ("zone_id") WHERE "vehicle_spawn_points"."is_active";--> statement-breakpoint
CREATE INDEX "landmark_media_landmark_idx" ON "landmark_media" USING btree ("landmark_id","sort_order");--> statement-breakpoint
CREATE INDEX "landmark_revisions_landmark_idx" ON "landmark_revisions" USING btree ("landmark_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "landmarks_location_gix" ON "landmarks" USING gist ("location");--> statement-breakpoint
CREATE INDEX "landmarks_location_geog_gix" ON "landmarks" USING gist ((("location")::geography));--> statement-breakpoint
CREATE INDEX "landmarks_zone_status_idx" ON "landmarks" USING btree ("zone_id","status") WHERE "landmarks"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "game_rooms_status_zone_idx" ON "game_rooms" USING btree ("status","zone_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_idx" ON "admin_audit_logs" USING btree ("actor_user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "user_moderation_actions_user_idx" ON "user_moderation_actions" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "user_reports_status_idx" ON "user_reports" USING btree ("status","created_at" DESC NULLS FIRST);