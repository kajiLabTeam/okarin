\restrict dbmate

-- Dumped from database version 17.10
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: analysis_run_trajectories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analysis_run_trajectories (
    analysis_run_id uuid NOT NULL,
    trajectory_id uuid NOT NULL,
    seq integer NOT NULL,
    CONSTRAINT analysis_run_trajectories_seq_check CHECK ((seq >= 0))
);


--
-- Name: analysis_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analysis_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    floor_id uuid NOT NULL,
    analysis_type text NOT NULL,
    status text DEFAULT 'accepted'::text NOT NULL,
    parameters jsonb NOT NULL,
    definition_version text NOT NULL,
    error_code text,
    started_at timestamp with time zone,
    deadline_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analysis_runs_analysis_type_nonempty_chk CHECK ((length(btrim(analysis_type)) > 0)),
    CONSTRAINT analysis_runs_definition_version_nonempty_chk CHECK ((length(btrim(definition_version)) > 0)),
    CONSTRAINT analysis_runs_parameters_object_chk CHECK ((jsonb_typeof(parameters) = 'object'::text)),
    CONSTRAINT analysis_runs_state_chk CHECK ((((status = 'accepted'::text) AND (started_at IS NULL) AND (finished_at IS NULL) AND (error_code IS NULL)) OR ((status = 'processing'::text) AND (started_at IS NOT NULL) AND (finished_at IS NULL) AND (error_code IS NULL)) OR ((status = 'completed'::text) AND (started_at IS NOT NULL) AND (finished_at IS NOT NULL) AND (error_code IS NULL)) OR ((status = 'failed'::text) AND (finished_at IS NOT NULL) AND (length(btrim(error_code)) > 0)))),
    CONSTRAINT analysis_runs_status_chk CHECK ((status = ANY (ARRAY['accepted'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_data_migrations (
    name text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT application_data_migrations_name_nonempty_chk CHECK ((length(btrim(name)) > 0))
);


ALTER TABLE ONLY public.application_data_migrations
    ADD CONSTRAINT application_data_migrations_pkey PRIMARY KEY (name);


CREATE TABLE public.audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_membership_id uuid,
    organization_id uuid,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    action text NOT NULL,
    changed_fields text[] NOT NULL,
    before_values jsonb,
    after_values jsonb,
    request_id text,
    CONSTRAINT audit_events_action_nonempty_chk CHECK ((length(btrim(action)) > 0)),
    CONSTRAINT audit_events_target_type_nonempty_chk CHECK ((length(btrim(target_type)) > 0))
);


--
-- Name: auth_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    hosted_domain text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_identities_provider_chk CHECK ((provider = 'google'::text))
);


--
-- Name: authentication_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authentication_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    outcome text NOT NULL,
    failure_code text,
    user_id uuid,
    organization_id uuid,
    membership_id uuid,
    session_id uuid,
    auth_method text,
    credential_reference_id uuid,
    request_id text,
    ip_address_hash text,
    user_agent text,
    CONSTRAINT authentication_events_auth_method_chk CHECK (((auth_method IS NULL) OR (auth_method = ANY (ARRAY['local'::text, 'oidc'::text])))),
    CONSTRAINT authentication_events_event_type_nonempty_chk CHECK ((length(btrim(event_type)) > 0)),
    CONSTRAINT authentication_events_outcome_chk CHECK ((outcome = ANY (ARRAY['success'::text, 'failure'::text])))
);


--
-- Name: buildings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buildings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL
);


--
-- Name: floors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beacons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    floor_id uuid NOT NULL,
    format_type text DEFAULT 'ibeacon'::text NOT NULL,
    format_config jsonb NOT NULL,
    name text NOT NULL,
    pixel_x double precision NOT NULL,
    pixel_y double precision NOT NULL,
    note text,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT beacons_format_type_chk CHECK ((format_type = 'ibeacon'::text)),
    CONSTRAINT beacons_format_config_object_chk CHECK ((jsonb_typeof(format_config) = 'object'::text)),
    CONSTRAINT beacons_name_nonempty_chk CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT beacons_pixel_x_nonnegative_chk CHECK ((pixel_x >= 0)),
    CONSTRAINT beacons_pixel_y_nonnegative_chk CHECK ((pixel_y >= 0))
);

-- Name: floors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.floors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    building_id uuid NOT NULL,
    level integer NOT NULL,
    name text NOT NULL,
    image_object_path text NOT NULL,
    scale double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL,
    map_width_px integer,
    map_height_px integer,
    CONSTRAINT floors_image_object_path_format_chk CHECK (((image_object_path ~ '^maps/[0-9a-fA-F-]+/[0-9a-fA-F-]+\.(svg|png)$'::text) OR (image_object_path ~ '^organizations/[0-9a-fA-F-]+/floors/[0-9a-fA-F-]+/map\.(svg|png)$'::text))),
    CONSTRAINT floors_map_dimensions_bounds_chk CHECK (((map_width_px IS NULL) OR ((map_width_px > 0) AND (map_height_px > 0) AND (map_width_px <= 20000) AND (map_height_px <= 20000) AND (((map_width_px)::bigint * (map_height_px)::bigint) <= 100000000)))),
    CONSTRAINT floors_map_dimensions_presence_chk CHECK ((((map_width_px IS NULL) AND (map_height_px IS NULL)) OR ((map_width_px IS NOT NULL) AND (map_height_px IS NOT NULL))))
);

ALTER TABLE ONLY public.beacons
    ADD CONSTRAINT beacons_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
    ADD CONSTRAINT beacons_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.floors(id);

CREATE INDEX beacons_floor_id_idx ON public.beacons USING btree (floor_id);
CREATE INDEX beacons_organization_id_idx ON public.beacons USING btree (organization_id);
CREATE UNIQUE INDEX beacons_org_active_name_key ON public.beacons USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX beacons_org_active_ibeacon_identity_key ON public.beacons USING btree (organization_id, (format_config ->> 'uuid'::text), (((format_config ->> 'major'::text))::integer), (((format_config ->> 'minor'::text))::integer)) WHERE ((deleted_at IS NULL) AND (format_type = 'ibeacon'::text));


--
-- Name: oidc_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oidc_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    issuer text NOT NULL,
    subject text NOT NULL,
    last_claimed_email text,
    last_claimed_email_verified boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oidc_identities_issuer_nonempty_chk CHECK ((length(btrim(issuer)) > 0)),
    CONSTRAINT oidc_identities_subject_nonempty_chk CHECK ((length(btrim(subject)) > 0))
);


--
-- Name: oidc_login_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oidc_login_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state_hash text NOT NULL,
    organization_id uuid NOT NULL,
    organization_oidc_provider_id uuid NOT NULL,
    session_id uuid,
    invite_id uuid,
    intent text NOT NULL,
    nonce text NOT NULL,
    pkce_code_verifier_ciphertext text NOT NULL,
    return_to text NOT NULL,
    expected_user_id uuid,
    mobile_redirect_uri text,
    mobile_code_challenge text,
    mobile_code_challenge_method text,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oidc_login_transactions_intent_chk CHECK ((intent = ANY (ARRAY['login'::text, 'reauthenticate'::text, 'accept_invite'::text, 'link_identity'::text]))),
    CONSTRAINT oidc_login_transactions_intent_state_chk CHECK ((((intent = 'login'::text) AND (session_id IS NULL) AND (invite_id IS NULL)) OR ((intent = 'reauthenticate'::text) AND (session_id IS NOT NULL) AND (invite_id IS NULL)) OR ((intent = 'accept_invite'::text) AND (invite_id IS NOT NULL)) OR ((intent = 'link_identity'::text) AND (session_id IS NOT NULL) AND (invite_id IS NULL)))),
    CONSTRAINT oidc_login_transactions_nonce_nonempty_chk CHECK ((length(btrim(nonce)) > 0)),
    CONSTRAINT oidc_login_transactions_pkce_nonempty_chk CHECK ((length(btrim(pkce_code_verifier_ciphertext)) > 0)),
    CONSTRAINT oidc_login_transactions_mobile_fields_chk CHECK (((mobile_redirect_uri IS NULL AND mobile_code_challenge IS NULL AND mobile_code_challenge_method IS NULL) OR (mobile_redirect_uri IS NOT NULL AND mobile_code_challenge IS NOT NULL AND mobile_code_challenge_method = 'S256'::text))),
    CONSTRAINT oidc_login_transactions_return_to_chk CHECK ((("left"(return_to, 1) = '/'::text) AND ("left"(return_to, 2) <> '//'::text) AND (POSITION(('\'::text) IN (return_to)) = 0))),
    CONSTRAINT oidc_login_transactions_state_hash_nonempty_chk CHECK ((length(btrim(state_hash)) > 0))
);

CREATE TABLE public.mobile_session_exchange_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_hash text NOT NULL,
    oidc_transaction_id uuid NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    intent text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mobile_session_exchange_codes_hash_nonempty_chk CHECK ((length(btrim(code_hash)) > 0)),
    CONSTRAINT mobile_session_exchange_codes_intent_chk CHECK ((intent = ANY (ARRAY['login'::text, 'reauthenticate'::text])))
);

CREATE UNIQUE INDEX mobile_session_exchange_codes_code_hash_idx ON public.mobile_session_exchange_codes USING btree (code_hash);
CREATE INDEX mobile_session_exchange_codes_expiry_idx ON public.mobile_session_exchange_codes USING btree (expires_at) WHERE (consumed_at IS NULL);


--
-- Name: organization_auth_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_auth_settings (
    organization_id uuid NOT NULL,
    local_auth_enabled boolean NOT NULL,
    oidc_auth_enabled boolean NOT NULL,
    policy_version bigint DEFAULT 1 NOT NULL,
    membership_grant_ttl_seconds integer NOT NULL,
    reauthentication_interval_seconds integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_auth_settings_auth_method_chk CHECK ((local_auth_enabled OR oidc_auth_enabled)),
    CONSTRAINT organization_auth_settings_grant_ttl_chk CHECK ((membership_grant_ttl_seconds > 0)),
    CONSTRAINT organization_auth_settings_policy_version_chk CHECK ((policy_version >= 1)),
    CONSTRAINT organization_auth_settings_reauth_interval_chk CHECK ((reauthentication_interval_seconds > 0)),
    CONSTRAINT organization_auth_settings_reauth_lte_ttl_chk CHECK ((reauthentication_interval_seconds <= membership_grant_ttl_seconds))
);


--
-- Name: organization_creation_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_creation_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_user_id uuid NOT NULL,
    requested_organization_name text NOT NULL,
    requested_slug text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by_user_id uuid,
    reviewed_at timestamp with time zone,
    rejected_reason text,
    created_organization_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_creation_requests_approved_organization_chk CHECK ((((status = 'approved'::text) AND (created_organization_id IS NOT NULL)) OR ((status <> 'approved'::text) AND (created_organization_id IS NULL)))),
    CONSTRAINT organization_creation_requests_name_nonempty_chk CHECK ((length(btrim(requested_organization_name)) > 0)),
    CONSTRAINT organization_creation_requests_requested_slug_format_chk CHECK (((requested_slug IS NULL) OR ((requested_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND ((length(requested_slug) >= 3) AND (length(requested_slug) <= 63)) AND (requested_slug <> ALL (ARRAY['admin'::text, 'api'::text, 'auth'::text, 'platform'::text, 'new'::text, 'settings'::text]))))),
    CONSTRAINT organization_creation_requests_reviewed_state_chk CHECK ((((status = 'pending'::text) AND (reviewed_by_user_id IS NULL) AND (reviewed_at IS NULL)) OR ((status = ANY (ARRAY['approved'::text, 'rejected'::text])) AND (reviewed_by_user_id IS NOT NULL) AND (reviewed_at IS NOT NULL)))),
    CONSTRAINT organization_creation_requests_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: organization_invite_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_invite_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invite_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    provider_subject text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_invite_redemptions_email_nonempty_chk CHECK ((length(btrim(email)) > 0)),
    CONSTRAINT organization_invite_redemptions_provider_subject_nonempty_chk CHECK ((length(btrim(provider_subject)) > 0))
);


--
-- Name: organization_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    token_hash text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    max_uses integer DEFAULT 1 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_membership_id uuid,
    redeemed_at timestamp with time zone,
    redeemed_membership_id uuid,
    CONSTRAINT organization_invites_email_nonempty_chk CHECK ((length(btrim(email)) > 0)),
    CONSTRAINT organization_invites_max_uses_chk CHECK ((max_uses > 0)),
    CONSTRAINT organization_invites_token_hash_nonempty_chk CHECK ((length(btrim(token_hash)) > 0)),
    CONSTRAINT organization_invites_usage_bounds_chk CHECK ((used_count <= max_uses)),
    CONSTRAINT organization_invites_used_count_chk CHECK ((used_count >= 0))
);


--
-- Name: organization_local_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_local_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    login_email text NOT NULL,
    normalized_login_email text NOT NULL,
    password_hash text NOT NULL,
    password_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_local_credentials_failed_attempts_chk CHECK ((failed_login_attempts >= 0)),
    CONSTRAINT organization_local_credentials_login_email_nonempty_chk CHECK ((length(btrim(login_email)) > 0)),
    CONSTRAINT organization_local_credentials_normalized_email_nonempty_chk CHECK ((length(btrim(normalized_login_email)) > 0)),
    CONSTRAINT organization_local_credentials_password_hash_nonempty_chk CHECK ((length(btrim(password_hash)) > 0))
);


--
-- Name: organization_member_oidc_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_member_oidc_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    organization_oidc_provider_id uuid NOT NULL,
    oidc_identity_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: organization_member_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_member_profiles (
    membership_id uuid NOT NULL,
    display_name text,
    height_meters numeric(5,3),
    stride_length_meters numeric(5,3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_member_profiles_display_name_chk CHECK (((display_name IS NULL) OR ((length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 255)))),
    CONSTRAINT organization_member_profiles_height_positive_chk CHECK (((height_meters IS NULL) OR (height_meters > (0)::numeric))),
    CONSTRAINT organization_member_profiles_stride_positive_chk CHECK (((stride_length_meters IS NULL) OR (stride_length_meters > (0)::numeric)))
);


--
-- Name: organization_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_memberships (
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    CONSTRAINT organization_memberships_role_chk CHECK ((role = ANY (ARRAY['member'::text, 'manager'::text, 'owner'::text])))
);


--
-- Name: organization_oidc_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_oidc_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    issuer text NOT NULL,
    client_id text NOT NULL,
    client_secret_ref text,
    scopes text[] NOT NULL,
    allowed_hosted_domains text[],
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_oidc_providers_client_id_nonempty_chk CHECK ((length(btrim(client_id)) > 0)),
    CONSTRAINT organization_oidc_providers_hosted_domains_nonempty_chk CHECK (((allowed_hosted_domains IS NULL) OR (cardinality(allowed_hosted_domains) > 0))),
    CONSTRAINT organization_oidc_providers_issuer_nonempty_chk CHECK ((length(btrim(issuer)) > 0)),
    CONSTRAINT organization_oidc_providers_name_nonempty_chk CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT organization_oidc_providers_openid_scope_chk CHECK (COALESCE(('openid'::text = ANY (scopes)), false))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text DEFAULT ('org-'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    status text DEFAULT 'active'::text,
    CONSTRAINT organizations_name_nonempty_chk CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT organizations_slug_format_chk CHECK (((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND ((length(slug) >= 3) AND (length(slug) <= 63)))),
    CONSTRAINT organizations_slug_reserved_chk CHECK ((slug <> ALL (ARRAY['admin'::text, 'api'::text, 'auth'::text, 'platform'::text, 'new'::text, 'settings'::text])))
);


--
-- Name: pedestrians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedestrians (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    height double precision,
    stride_length double precision,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text NOT NULL,
    user_id uuid,
    organization_id uuid NOT NULL,
    membership_id uuid,
    CONSTRAINT pedestrians_display_name_nonempty_chk CHECK ((length(btrim(display_name)) > 0))
);


--
-- Name: recordings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recordings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedestrian_id uuid NOT NULL,
    floor_id uuid NOT NULL,
    upload_status text DEFAULT 'accepted'::text NOT NULL,
    upload_targets text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    organization_id uuid NOT NULL,
    constraints jsonb DEFAULT '[]'::jsonb NOT NULL,
    upload_failure jsonb,
    CONSTRAINT recordings_constraints_array_check CHECK ((jsonb_typeof(constraints) = 'array'::text)),
    CONSTRAINT recordings_upload_status_chk CHECK ((upload_status = ANY (ARRAY['accepted'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT recordings_upload_targets_nonempty_chk CHECK ((cardinality(upload_targets) >= 1))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: session_membership_authentications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_membership_authentications (
    session_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    user_id uuid NOT NULL,
    auth_method text NOT NULL,
    policy_version bigint NOT NULL,
    local_credential_id uuid,
    member_oidc_identity_id uuid,
    authenticated_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_membership_auth_expiry_chk CHECK ((expires_at > authenticated_at)),
    CONSTRAINT session_membership_auth_policy_version_chk CHECK ((policy_version >= 1)),
    CONSTRAINT session_membership_auth_source_chk CHECK ((((auth_method = 'local'::text) AND (local_credential_id IS NOT NULL) AND (member_oidc_identity_id IS NULL)) OR ((auth_method = 'oidc'::text) AND (local_credential_id IS NULL) AND (member_oidc_identity_id IS NOT NULL))))
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    auth_method text DEFAULT 'password'::text NOT NULL,
    CONSTRAINT sessions_auth_method_chk CHECK ((auth_method = ANY (ARRAY['password'::text, 'oidc'::text]))),
    CONSTRAINT sessions_session_hash_nonempty_chk CHECK ((length(btrim(session_hash)) > 0))
);


--
-- Name: trajectories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trajectories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recording_id uuid NOT NULL,
    floor_id uuid NOT NULL,
    status text DEFAULT 'accepted'::text NOT NULL,
    error_code text,
    error_message text,
    failed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    organization_id uuid NOT NULL,
    constraints jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT trajectories_constraints_array_check CHECK ((jsonb_typeof(constraints) = 'array'::text)),
    CONSTRAINT trajectories_failed_at_chk CHECK ((((status = 'failed'::text) AND (failed_at IS NOT NULL)) OR ((status <> 'failed'::text) AND (failed_at IS NULL)))),
    CONSTRAINT trajectories_status_chk CHECK ((status = ANY (ARRAY['accepted'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: user_activation_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activation_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_activation_tokens_token_hash_nonempty_chk CHECK ((length(btrim(token_hash)) > 0))
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    user_id uuid NOT NULL,
    display_name text NOT NULL,
    locale text DEFAULT 'ja-JP'::text NOT NULL,
    timezone text DEFAULT 'Asia/Tokyo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_profiles_display_name_chk CHECK (((length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 255))),
    CONSTRAINT user_profiles_locale_nonempty_chk CHECK ((length(btrim(locale)) > 0)),
    CONSTRAINT user_profiles_timezone_nonempty_chk CHECK ((length(btrim(timezone)) > 0))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text,
    display_name text NOT NULL,
    global_role text DEFAULT 'none'::text NOT NULL,
    password_changed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    status text NOT NULL,
    contact_email text,
    normalized_contact_email text,
    contact_email_verified_at timestamp with time zone,
    CONSTRAINT users_display_name_nonempty_chk CHECK ((length(btrim(display_name)) > 0)),
    CONSTRAINT users_email_nonempty_chk CHECK ((length(btrim(email)) > 0)),
    CONSTRAINT users_global_role_chk CHECK ((global_role = ANY (ARRAY['none'::text, 'admin'::text]))),
    CONSTRAINT users_password_hash_nonempty_chk CHECK (((password_hash IS NULL) OR (length(btrim(password_hash)) > 0))),
    CONSTRAINT users_status_chk CHECK ((status = ANY (ARRAY['pending_activation'::text, 'active'::text, 'disabled'::text])))
);


--
-- Name: analysis_run_trajectories analysis_run_trajectories_analysis_run_id_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_run_trajectories
    ADD CONSTRAINT analysis_run_trajectories_analysis_run_id_seq_key UNIQUE (analysis_run_id, seq);


--
-- Name: analysis_run_trajectories analysis_run_trajectories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_run_trajectories
    ADD CONSTRAINT analysis_run_trajectories_pkey PRIMARY KEY (analysis_run_id, trajectory_id);


--
-- Name: analysis_runs analysis_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_runs
    ADD CONSTRAINT analysis_runs_pkey PRIMARY KEY (id);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: auth_identities auth_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_pkey PRIMARY KEY (id);


--
-- Name: auth_identities auth_identities_provider_subject_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_provider_subject_unique UNIQUE (provider, provider_subject);


--
-- Name: authentication_events authentication_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authentication_events
    ADD CONSTRAINT authentication_events_pkey PRIMARY KEY (id);


--
-- Name: buildings buildings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buildings
    ADD CONSTRAINT buildings_pkey PRIMARY KEY (id);


--
-- Name: floors floors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.floors
    ADD CONSTRAINT floors_pkey PRIMARY KEY (id);


--
-- Name: oidc_identities oidc_identities_id_user_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_identities
    ADD CONSTRAINT oidc_identities_id_user_key UNIQUE (id, user_id);


--
-- Name: oidc_identities oidc_identities_issuer_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_identities
    ADD CONSTRAINT oidc_identities_issuer_subject_key UNIQUE (issuer, subject);


--
-- Name: oidc_identities oidc_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_identities
    ADD CONSTRAINT oidc_identities_pkey PRIMARY KEY (id);


--
-- Name: oidc_login_transactions oidc_login_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_login_transactions
    ADD CONSTRAINT oidc_login_transactions_pkey PRIMARY KEY (id);


--
-- Name: oidc_login_transactions oidc_login_transactions_state_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_login_transactions
    ADD CONSTRAINT oidc_login_transactions_state_hash_key UNIQUE (state_hash);


--
-- Name: organization_auth_settings organization_auth_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_auth_settings
    ADD CONSTRAINT organization_auth_settings_pkey PRIMARY KEY (organization_id);


--
-- Name: organization_creation_requests organization_creation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_creation_requests
    ADD CONSTRAINT organization_creation_requests_pkey PRIMARY KEY (id);


--
-- Name: organization_invite_redemptions organization_invite_redemptions_invite_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invite_redemptions
    ADD CONSTRAINT organization_invite_redemptions_invite_user_unique UNIQUE (invite_id, user_id);


--
-- Name: organization_invite_redemptions organization_invite_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invite_redemptions
    ADD CONSTRAINT organization_invite_redemptions_pkey PRIMARY KEY (id);


--
-- Name: organization_invites organization_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_pkey PRIMARY KEY (id);


--
-- Name: organization_invites organization_invites_redemption_state_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organization_invites
    ADD CONSTRAINT organization_invites_redemption_state_chk CHECK ((((redeemed_at IS NULL) AND (redeemed_membership_id IS NULL)) OR ((redeemed_at IS NOT NULL) AND (redeemed_membership_id IS NOT NULL)))) NOT VALID;


--
-- Name: organization_invites organization_invites_revoked_redeemed_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organization_invites
    ADD CONSTRAINT organization_invites_revoked_redeemed_chk CHECK (((revoked_at IS NULL) OR (redeemed_at IS NULL))) NOT VALID;


--
-- Name: organization_invites organization_invites_role_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organization_invites
    ADD CONSTRAINT organization_invites_role_chk CHECK ((role = ANY (ARRAY['member'::text, 'manager'::text]))) NOT VALID;


--
-- Name: organization_invites organization_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_token_hash_key UNIQUE (token_hash);


--
-- Name: organization_local_credentials organization_local_credentials_id_membership_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_local_credentials
    ADD CONSTRAINT organization_local_credentials_id_membership_key UNIQUE (id, membership_id);


--
-- Name: organization_local_credentials organization_local_credentials_membership_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_local_credentials
    ADD CONSTRAINT organization_local_credentials_membership_key UNIQUE (membership_id);


--
-- Name: organization_local_credentials organization_local_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_local_credentials
    ADD CONSTRAINT organization_local_credentials_pkey PRIMARY KEY (id);


--
-- Name: organization_member_oidc_identities organization_member_oidc_id_membership_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_oidc_identities
    ADD CONSTRAINT organization_member_oidc_id_membership_key UNIQUE (id, membership_id);


--
-- Name: organization_member_oidc_identities organization_member_oidc_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_oidc_identities
    ADD CONSTRAINT organization_member_oidc_identities_pkey PRIMARY KEY (id);


--
-- Name: organization_member_oidc_identities organization_member_oidc_link_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_oidc_identities
    ADD CONSTRAINT organization_member_oidc_link_key UNIQUE (membership_id, organization_oidc_provider_id, oidc_identity_id);


--
-- Name: organization_member_profiles organization_member_profiles_height_meter_bounds_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organization_member_profiles
    ADD CONSTRAINT organization_member_profiles_height_meter_bounds_chk CHECK (((height_meters IS NULL) OR (height_meters <= (3)::numeric))) NOT VALID;


--
-- Name: organization_member_profiles organization_member_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_profiles
    ADD CONSTRAINT organization_member_profiles_pkey PRIMARY KEY (membership_id);


--
-- Name: organization_member_profiles organization_member_profiles_stride_meter_bounds_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organization_member_profiles
    ADD CONSTRAINT organization_member_profiles_stride_meter_bounds_chk CHECK (((stride_length_meters IS NULL) OR (stride_length_meters <= (3)::numeric))) NOT VALID;


--
-- Name: organization_memberships organization_memberships_left_at_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organization_memberships
    ADD CONSTRAINT organization_memberships_left_at_chk CHECK ((((status = 'left'::text) AND (left_at IS NOT NULL)) OR ((status <> 'left'::text) AND (left_at IS NULL)))) NOT VALID;


--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);


--
-- Name: organization_memberships organization_memberships_status_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organization_memberships
    ADD CONSTRAINT organization_memberships_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'left'::text]))) NOT VALID;


--
-- Name: organization_oidc_providers organization_oidc_providers_id_org_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_oidc_providers
    ADD CONSTRAINT organization_oidc_providers_id_org_key UNIQUE (id, organization_id);


--
-- Name: organization_oidc_providers organization_oidc_providers_org_issuer_client_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_oidc_providers
    ADD CONSTRAINT organization_oidc_providers_org_issuer_client_key UNIQUE (organization_id, issuer, client_id);


--
-- Name: organization_oidc_providers organization_oidc_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_oidc_providers
    ADD CONSTRAINT organization_oidc_providers_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: organizations organizations_status_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text]))) NOT VALID;


--
-- Name: pedestrians pedestrians_height_meter_bounds_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.pedestrians
    ADD CONSTRAINT pedestrians_height_meter_bounds_chk CHECK (((height IS NULL) OR ((height > (0)::double precision) AND (height <= (3)::double precision)))) NOT VALID;


--
-- Name: pedestrians pedestrians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedestrians
    ADD CONSTRAINT pedestrians_pkey PRIMARY KEY (id);


--
-- Name: pedestrians pedestrians_stride_meter_bounds_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.pedestrians
    ADD CONSTRAINT pedestrians_stride_meter_bounds_chk CHECK (((stride_length IS NULL) OR ((stride_length > (0)::double precision) AND (stride_length <= (3)::double precision)))) NOT VALID;


--
-- Name: pedestrians pedestrians_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedestrians
    ADD CONSTRAINT pedestrians_user_id_key UNIQUE (user_id);


--
-- Name: recordings recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: session_membership_authentications session_membership_authentications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_membership_authentications
    ADD CONSTRAINT session_membership_authentications_pkey PRIMARY KEY (session_id, membership_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_session_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_session_hash_key UNIQUE (session_hash);


--
-- Name: trajectories trajectories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trajectories
    ADD CONSTRAINT trajectories_pkey PRIMARY KEY (id);


--
-- Name: user_activation_tokens user_activation_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_tokens
    ADD CONSTRAINT user_activation_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_activation_tokens user_activation_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_tokens
    ADD CONSTRAINT user_activation_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: users users_contact_email_state_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.users
    ADD CONSTRAINT users_contact_email_state_chk CHECK (((contact_email IS NOT NULL) OR ((normalized_contact_email IS NULL) AND (contact_email_verified_at IS NULL)))) NOT VALID;


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: analysis_run_trajectories_trajectory_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analysis_run_trajectories_trajectory_id_idx ON public.analysis_run_trajectories USING btree (trajectory_id);


--
-- Name: analysis_runs_organization_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analysis_runs_organization_created_at_id_idx ON public.analysis_runs USING btree (organization_id, created_at DESC, id DESC);


--
-- Name: audit_events_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_occurred_at_idx ON public.audit_events USING btree (occurred_at);


--
-- Name: audit_events_org_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_org_occurred_at_idx ON public.audit_events USING btree (organization_id, occurred_at DESC);


--
-- Name: audit_events_target_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_target_occurred_at_idx ON public.audit_events USING btree (target_type, target_id, occurred_at DESC);


--
-- Name: auth_identities_one_google_identity_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_identities_one_google_identity_per_user ON public.auth_identities USING btree (provider, user_id) WHERE (provider = 'google'::text);


--
-- Name: auth_identities_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_identities_user_id_idx ON public.auth_identities USING btree (user_id);


--
-- Name: authentication_events_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authentication_events_occurred_at_idx ON public.authentication_events USING btree (occurred_at);


--
-- Name: authentication_events_org_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authentication_events_org_occurred_at_idx ON public.authentication_events USING btree (organization_id, occurred_at DESC);


--
-- Name: authentication_events_user_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authentication_events_user_occurred_at_idx ON public.authentication_events USING btree (user_id, occurred_at DESC);


--
-- Name: buildings_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buildings_organization_id_idx ON public.buildings USING btree (organization_id);


--
-- Name: floors_building_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX floors_building_id_idx ON public.floors USING btree (building_id);


--
-- Name: floors_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX floors_organization_id_idx ON public.floors USING btree (organization_id);


--
-- Name: oidc_login_transactions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oidc_login_transactions_expires_at_idx ON public.oidc_login_transactions USING btree (expires_at);


--
-- Name: organization_creation_requests_one_pending_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_creation_requests_one_pending_per_user ON public.organization_creation_requests USING btree (requester_user_id) WHERE (status = 'pending'::text);


--
-- Name: organization_creation_requests_requester_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_creation_requests_requester_user_id_idx ON public.organization_creation_requests USING btree (requester_user_id);


--
-- Name: organization_creation_requests_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_creation_requests_status_created_at_idx ON public.organization_creation_requests USING btree (status, created_at DESC);


--
-- Name: organization_invite_redemptions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invite_redemptions_user_id_idx ON public.organization_invite_redemptions USING btree (user_id);


--
-- Name: organization_invites_active_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_active_expires_at_idx ON public.organization_invites USING btree (expires_at) WHERE ((revoked_at IS NULL) AND (redeemed_at IS NULL));


--
-- Name: organization_invites_created_by_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_created_by_user_id_idx ON public.organization_invites USING btree (created_by_user_id);


--
-- Name: organization_invites_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_email_idx ON public.organization_invites USING btree (email);


--
-- Name: organization_invites_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_expires_at_idx ON public.organization_invites USING btree (expires_at);


--
-- Name: organization_invites_org_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_org_created_at_idx ON public.organization_invites USING btree (organization_id, created_at DESC);


--
-- Name: organization_invites_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_organization_id_idx ON public.organization_invites USING btree (organization_id);


--
-- Name: organization_invites_redeemed_membership_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_invites_redeemed_membership_key ON public.organization_invites USING btree (redeemed_membership_id);


--
-- Name: organization_local_credentials_active_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_local_credentials_active_email_key ON public.organization_local_credentials USING btree (organization_id, normalized_login_email) WHERE enabled;


--
-- Name: organization_member_oidc_active_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_member_oidc_active_membership_idx ON public.organization_member_oidc_identities USING btree (membership_id) WHERE (revoked_at IS NULL);


--
-- Name: organization_member_oidc_active_provider_identity_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_member_oidc_active_provider_identity_key ON public.organization_member_oidc_identities USING btree (organization_oidc_provider_id, oidc_identity_id) WHERE (revoked_at IS NULL);


--
-- Name: organization_memberships_current_user_org_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_memberships_current_user_org_key ON public.organization_memberships USING btree (organization_id, user_id) WHERE (status = ANY (ARRAY['active'::text, 'suspended'::text]));


--
-- Name: organization_memberships_id_organization_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_memberships_id_organization_key ON public.organization_memberships USING btree (id, organization_id);


--
-- Name: organization_memberships_id_user_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_memberships_id_user_key ON public.organization_memberships USING btree (id, user_id);


--
-- Name: organization_memberships_org_status_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_org_status_role_idx ON public.organization_memberships USING btree (organization_id, status, role);


--
-- Name: organization_memberships_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_user_id_idx ON public.organization_memberships USING btree (user_id);


--
-- Name: organization_memberships_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_user_status_idx ON public.organization_memberships USING btree (user_id, status);


--
-- Name: pedestrians_membership_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pedestrians_membership_id_key ON public.pedestrians USING btree (membership_id) WHERE (membership_id IS NOT NULL);


--
-- Name: pedestrians_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedestrians_organization_id_idx ON public.pedestrians USING btree (organization_id);


--
-- Name: recordings_floor_id_created_at_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_floor_id_created_at_active_idx ON public.recordings USING btree (floor_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: recordings_organization_created_at_id_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_organization_created_at_id_active_idx ON public.recordings USING btree (organization_id, created_at DESC, id DESC) WHERE (deleted_at IS NULL);


--
-- Name: recordings_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_organization_id_idx ON public.recordings USING btree (organization_id);


--
-- Name: recordings_pedestrian_created_at_id_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_pedestrian_created_at_id_active_idx ON public.recordings USING btree (pedestrian_id, created_at DESC, id DESC) WHERE (deleted_at IS NULL);


--
-- Name: recordings_pedestrian_id_created_at_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_pedestrian_id_created_at_active_idx ON public.recordings USING btree (pedestrian_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: session_membership_auth_active_local_credential_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_membership_auth_active_local_credential_idx ON public.session_membership_authentications USING btree (local_credential_id) WHERE (revoked_at IS NULL);


--
-- Name: session_membership_auth_active_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_membership_auth_active_membership_idx ON public.session_membership_authentications USING btree (membership_id) WHERE (revoked_at IS NULL);


--
-- Name: session_membership_auth_active_oidc_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_membership_auth_active_oidc_identity_idx ON public.session_membership_authentications USING btree (member_oidc_identity_id) WHERE (revoked_at IS NULL);


--
-- Name: sessions_active_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_active_expires_at_idx ON public.sessions USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- Name: sessions_active_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_active_user_idx ON public.sessions USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_id_user_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_id_user_key ON public.sessions USING btree (id, user_id);


--
-- Name: sessions_revoked_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_revoked_at_idx ON public.sessions USING btree (revoked_at);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: trajectories_organization_created_at_id_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_organization_created_at_id_active_idx ON public.trajectories USING btree (organization_id, created_at DESC, id DESC) WHERE (deleted_at IS NULL);


--
-- Name: trajectories_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_organization_id_idx ON public.trajectories USING btree (organization_id);


--
-- Name: trajectories_recording_created_at_id_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_recording_created_at_id_active_idx ON public.trajectories USING btree (recording_id, created_at DESC, id DESC) WHERE (deleted_at IS NULL);


--
-- Name: trajectories_recording_id_created_at_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_recording_id_created_at_active_idx ON public.trajectories USING btree (recording_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: trajectories_status_created_at_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_status_created_at_active_idx ON public.trajectories USING btree (status, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: user_activation_tokens_created_by_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_activation_tokens_created_by_user_id_idx ON public.user_activation_tokens USING btree (created_by_user_id);


--
-- Name: user_activation_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_activation_tokens_expires_at_idx ON public.user_activation_tokens USING btree (expires_at);


--
-- Name: user_activation_tokens_one_active_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_activation_tokens_one_active_per_user ON public.user_activation_tokens USING btree (user_id) WHERE ((used_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: user_activation_tokens_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_activation_tokens_organization_id_idx ON public.user_activation_tokens USING btree (organization_id);


--
-- Name: user_activation_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_activation_tokens_user_id_idx ON public.user_activation_tokens USING btree (user_id);


--
-- Name: auth_identities set_updated_at_auth_identities; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_auth_identities BEFORE UPDATE ON public.auth_identities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: buildings set_updated_at_buildings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_buildings BEFORE UPDATE ON public.buildings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_beacons BEFORE UPDATE ON public.beacons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: floors set_updated_at_floors; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_floors BEFORE UPDATE ON public.floors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: oidc_identities set_updated_at_oidc_identities; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_oidc_identities BEFORE UPDATE ON public.oidc_identities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_auth_settings set_updated_at_organization_auth_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_auth_settings BEFORE UPDATE ON public.organization_auth_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_creation_requests set_updated_at_organization_creation_requests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_creation_requests BEFORE UPDATE ON public.organization_creation_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_invites set_updated_at_organization_invites; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_invites BEFORE UPDATE ON public.organization_invites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_local_credentials set_updated_at_organization_local_credentials; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_local_credentials BEFORE UPDATE ON public.organization_local_credentials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_member_oidc_identities set_updated_at_organization_member_oidc_identities; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_member_oidc_identities BEFORE UPDATE ON public.organization_member_oidc_identities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_member_profiles set_updated_at_organization_member_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_member_profiles BEFORE UPDATE ON public.organization_member_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_memberships set_updated_at_organization_memberships; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_memberships BEFORE UPDATE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_oidc_providers set_updated_at_organization_oidc_providers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_oidc_providers BEFORE UPDATE ON public.organization_oidc_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organizations set_updated_at_organizations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organizations BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pedestrians set_updated_at_pedestrians; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_pedestrians BEFORE UPDATE ON public.pedestrians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: recordings set_updated_at_recordings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_recordings BEFORE UPDATE ON public.recordings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: session_membership_authentications set_updated_at_session_membership_authentications; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_session_membership_authentications BEFORE UPDATE ON public.session_membership_authentications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: trajectories set_updated_at_trajectories; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trajectories BEFORE UPDATE ON public.trajectories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_profiles set_updated_at_user_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_user_profiles BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users set_updated_at_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: analysis_run_trajectories analysis_run_trajectories_analysis_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_run_trajectories
    ADD CONSTRAINT analysis_run_trajectories_analysis_run_id_fkey FOREIGN KEY (analysis_run_id) REFERENCES public.analysis_runs(id) ON DELETE CASCADE;


--
-- Name: analysis_run_trajectories analysis_run_trajectories_trajectory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_run_trajectories
    ADD CONSTRAINT analysis_run_trajectories_trajectory_id_fkey FOREIGN KEY (trajectory_id) REFERENCES public.trajectories(id);


--
-- Name: analysis_runs analysis_runs_floor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_runs
    ADD CONSTRAINT analysis_runs_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.floors(id);


--
-- Name: analysis_runs analysis_runs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_runs
    ADD CONSTRAINT analysis_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: auth_identities auth_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: buildings buildings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buildings
    ADD CONSTRAINT buildings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: floors floors_building_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.floors
    ADD CONSTRAINT floors_building_id_fkey FOREIGN KEY (building_id) REFERENCES public.buildings(id) ON DELETE RESTRICT;


--
-- Name: floors floors_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.floors
    ADD CONSTRAINT floors_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: oidc_identities oidc_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_identities
    ADD CONSTRAINT oidc_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: oidc_login_transactions oidc_login_transactions_invite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_login_transactions
    ADD CONSTRAINT oidc_login_transactions_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES public.organization_invites(id) ON DELETE RESTRICT;


--
-- Name: oidc_login_transactions oidc_login_transactions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_login_transactions
    ADD CONSTRAINT oidc_login_transactions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: oidc_login_transactions oidc_login_transactions_provider_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_login_transactions
    ADD CONSTRAINT oidc_login_transactions_provider_org_fkey FOREIGN KEY (organization_oidc_provider_id, organization_id) REFERENCES public.organization_oidc_providers(id, organization_id) ON DELETE RESTRICT;


--
-- Name: oidc_login_transactions oidc_login_transactions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_login_transactions
    ADD CONSTRAINT oidc_login_transactions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE RESTRICT;


--
-- Name: organization_auth_settings organization_auth_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_auth_settings
    ADD CONSTRAINT organization_auth_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: organization_creation_requests organization_creation_requests_created_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_creation_requests
    ADD CONSTRAINT organization_creation_requests_created_organization_id_fkey FOREIGN KEY (created_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: organization_creation_requests organization_creation_requests_requester_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_creation_requests
    ADD CONSTRAINT organization_creation_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: organization_creation_requests organization_creation_requests_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_creation_requests
    ADD CONSTRAINT organization_creation_requests_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: organization_invite_redemptions organization_invite_redemptions_invite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invite_redemptions
    ADD CONSTRAINT organization_invite_redemptions_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES public.organization_invites(id) ON DELETE RESTRICT;


--
-- Name: organization_invite_redemptions organization_invite_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invite_redemptions
    ADD CONSTRAINT organization_invite_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: organization_invites organization_invites_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: organization_invites organization_invites_creator_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_creator_org_fkey FOREIGN KEY (created_by_membership_id, organization_id) REFERENCES public.organization_memberships(id, organization_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: organization_invites organization_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: organization_invites organization_invites_redeemed_membership_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_redeemed_membership_org_fkey FOREIGN KEY (redeemed_membership_id, organization_id) REFERENCES public.organization_memberships(id, organization_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: organization_local_credentials organization_local_credentials_membership_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_local_credentials
    ADD CONSTRAINT organization_local_credentials_membership_org_fkey FOREIGN KEY (membership_id, organization_id) REFERENCES public.organization_memberships(id, organization_id) ON DELETE RESTRICT;


--
-- Name: organization_member_oidc_identities organization_member_oidc_identity_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_oidc_identities
    ADD CONSTRAINT organization_member_oidc_identity_user_fkey FOREIGN KEY (oidc_identity_id, user_id) REFERENCES public.oidc_identities(id, user_id) ON DELETE RESTRICT;


--
-- Name: organization_member_oidc_identities organization_member_oidc_membership_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_oidc_identities
    ADD CONSTRAINT organization_member_oidc_membership_org_fkey FOREIGN KEY (membership_id, organization_id) REFERENCES public.organization_memberships(id, organization_id) ON DELETE RESTRICT;


--
-- Name: organization_member_oidc_identities organization_member_oidc_membership_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_oidc_identities
    ADD CONSTRAINT organization_member_oidc_membership_user_fkey FOREIGN KEY (membership_id, user_id) REFERENCES public.organization_memberships(id, user_id) ON DELETE RESTRICT;


--
-- Name: organization_member_oidc_identities organization_member_oidc_provider_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_oidc_identities
    ADD CONSTRAINT organization_member_oidc_provider_org_fkey FOREIGN KEY (organization_oidc_provider_id, organization_id) REFERENCES public.organization_oidc_providers(id, organization_id) ON DELETE RESTRICT;


--
-- Name: organization_member_profiles organization_member_profiles_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_profiles
    ADD CONSTRAINT organization_member_profiles_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.organization_memberships(id) ON DELETE RESTRICT;


--
-- Name: organization_memberships organization_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: organization_memberships organization_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: organization_oidc_providers organization_oidc_providers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_oidc_providers
    ADD CONSTRAINT organization_oidc_providers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: pedestrians pedestrians_membership_organization_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedestrians
    ADD CONSTRAINT pedestrians_membership_organization_fkey FOREIGN KEY (membership_id, organization_id) REFERENCES public.organization_memberships(id, organization_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: pedestrians pedestrians_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedestrians
    ADD CONSTRAINT pedestrians_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: pedestrians pedestrians_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedestrians
    ADD CONSTRAINT pedestrians_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: recordings recordings_floor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.floors(id) ON DELETE RESTRICT;


--
-- Name: recordings recordings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: recordings recordings_pedestrian_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_pedestrian_id_fkey FOREIGN KEY (pedestrian_id) REFERENCES public.pedestrians(id) ON DELETE RESTRICT;


--
-- Name: session_membership_authentications session_membership_auth_local_source_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_membership_authentications
    ADD CONSTRAINT session_membership_auth_local_source_fkey FOREIGN KEY (local_credential_id, membership_id) REFERENCES public.organization_local_credentials(id, membership_id) ON DELETE RESTRICT;


--
-- Name: session_membership_authentications session_membership_auth_membership_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_membership_authentications
    ADD CONSTRAINT session_membership_auth_membership_user_fkey FOREIGN KEY (membership_id, user_id) REFERENCES public.organization_memberships(id, user_id) ON DELETE RESTRICT;


--
-- Name: session_membership_authentications session_membership_auth_oidc_source_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_membership_authentications
    ADD CONSTRAINT session_membership_auth_oidc_source_fkey FOREIGN KEY (member_oidc_identity_id, membership_id) REFERENCES public.organization_member_oidc_identities(id, membership_id) ON DELETE RESTRICT;


--
-- Name: session_membership_authentications session_membership_auth_session_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_membership_authentications
    ADD CONSTRAINT session_membership_auth_session_user_fkey FOREIGN KEY (session_id, user_id) REFERENCES public.sessions(id, user_id) ON DELETE RESTRICT;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: trajectories trajectories_floor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trajectories
    ADD CONSTRAINT trajectories_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.floors(id) ON DELETE RESTRICT;


--
-- Name: trajectories trajectories_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trajectories
    ADD CONSTRAINT trajectories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: trajectories trajectories_recording_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trajectories
    ADD CONSTRAINT trajectories_recording_id_fkey FOREIGN KEY (recording_id) REFERENCES public.recordings(id) ON DELETE RESTRICT;


--
-- Name: user_activation_tokens user_activation_tokens_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_tokens
    ADD CONSTRAINT user_activation_tokens_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_activation_tokens user_activation_tokens_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_tokens
    ADD CONSTRAINT user_activation_tokens_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: user_activation_tokens user_activation_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_tokens
    ADD CONSTRAINT user_activation_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20260425120000'),
    ('20260501110000'),
    ('20260531160000'),
    ('20260610050000'),
    ('20260610060000'),
    ('20260610070000'),
    ('20260610080000'),
    ('20260616090000'),
    ('20260616100000'),
    ('20260623010000'),
    ('20260626010000'),
    ('20260708010000'),
    ('20260728010000'),
    ('20260728010100'),
    ('20260728010200'),
    ('20260728010300'),
    ('20260801010000'),
    ('20260804010000'),
    ('20260804020000'),
    ('20260811010000'),
    ('20260811010051'),
    ('20260811010052'),
    ('20260811010053'),
    ('20260811010054'),
    ('20260811010055'),
    ('20260811010056'),
    ('20260811010057'),
    ('20260811010058'),
    ('20260811010100'),
    ('20260811010200'),
    ('20260811010250'),
    ('20260811010300'),
    ('20260811010400'),
    ('20260811010500'),
    ('20260811010551'),
    ('20260811010552'),
    ('20260811010553'),
    ('20260812010000'),
    ('20260812020000'),
    ('20260812020100'),
    ('20260830010000');
