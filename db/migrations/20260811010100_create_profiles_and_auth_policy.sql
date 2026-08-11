-- migrate:up

CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  locale text NOT NULL DEFAULT 'ja-JP',
  timezone text NOT NULL DEFAULT 'Asia/Tokyo',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT user_profiles_display_name_chk
    CHECK (length(btrim(display_name)) BETWEEN 1 AND 255),
  CONSTRAINT user_profiles_locale_nonempty_chk
    CHECK (length(btrim(locale)) > 0),
  CONSTRAINT user_profiles_timezone_nonempty_chk
    CHECK (length(btrim(timezone)) > 0)
);

CREATE TABLE organization_member_profiles (
  membership_id uuid PRIMARY KEY
    REFERENCES organization_memberships(id) ON DELETE RESTRICT,
  display_name text,
  height_meters numeric(5, 3),
  stride_length_meters numeric(5, 3),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_member_profiles_display_name_chk
    CHECK (
      display_name IS NULL
      OR length(btrim(display_name)) BETWEEN 1 AND 255
    ),
  CONSTRAINT organization_member_profiles_height_positive_chk
    CHECK (height_meters IS NULL OR height_meters > 0),
  CONSTRAINT organization_member_profiles_stride_positive_chk
    CHECK (stride_length_meters IS NULL OR stride_length_meters > 0)
);

CREATE TABLE organization_auth_settings (
  organization_id uuid PRIMARY KEY
    REFERENCES organizations(id) ON DELETE RESTRICT,
  local_auth_enabled boolean NOT NULL,
  oidc_auth_enabled boolean NOT NULL,
  policy_version bigint NOT NULL DEFAULT 1,
  membership_grant_ttl_seconds integer NOT NULL,
  reauthentication_interval_seconds integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_auth_settings_policy_version_chk
    CHECK (policy_version >= 1),
  CONSTRAINT organization_auth_settings_grant_ttl_chk
    CHECK (membership_grant_ttl_seconds > 0),
  CONSTRAINT organization_auth_settings_reauth_interval_chk
    CHECK (reauthentication_interval_seconds > 0),
  CONSTRAINT organization_auth_settings_reauth_lte_ttl_chk
    CHECK (
      reauthentication_interval_seconds <= membership_grant_ttl_seconds
    ),
  CONSTRAINT organization_auth_settings_auth_method_chk
    CHECK (
      local_auth_enabled OR oidc_auth_enabled
    )
);

CREATE TRIGGER set_updated_at_user_profiles
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_organization_member_profiles
BEFORE UPDATE ON organization_member_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_organization_auth_settings
BEFORE UPDATE ON organization_auth_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS set_updated_at_organization_auth_settings
  ON organization_auth_settings;
DROP TRIGGER IF EXISTS set_updated_at_organization_member_profiles
  ON organization_member_profiles;
DROP TRIGGER IF EXISTS set_updated_at_user_profiles ON user_profiles;

DROP TABLE IF EXISTS organization_auth_settings;
DROP TABLE IF EXISTS organization_member_profiles;
DROP TABLE IF EXISTS user_profiles;
