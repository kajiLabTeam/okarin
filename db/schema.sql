\restrict dbmate

-- Dumped from database version 17.9
-- Dumped by pg_dump version 18.3

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
    CONSTRAINT auth_identities_provider_chk CHECK ((provider = ANY (ARRAY['google'::text])))
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
    CONSTRAINT floors_image_object_path_format_chk CHECK ((image_object_path ~ '^maps/[0-9a-fA-F-]+/[0-9a-fA-F-]+\.(svg|png)$'::text))
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
    CONSTRAINT organization_memberships_role_chk CHECK ((role = ANY (ARRAY['member'::text, 'manager'::text, 'owner'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text DEFAULT ('org-'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organizations_name_nonempty_chk CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT organizations_slug_format_chk CHECK (((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) >= 3) AND (length(slug) <= 63))),
    CONSTRAINT organizations_slug_reserved_chk CHECK ((slug <> ALL (ARRAY['admin'::text, 'api'::text, 'auth'::text, 'platform'::text, 'new'::text, 'settings'::text])))
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
    CONSTRAINT organization_creation_requests_requested_slug_format_chk CHECK (((requested_slug IS NULL) OR ((requested_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(requested_slug) >= 3) AND (length(requested_slug) <= 63) AND (requested_slug <> ALL (ARRAY['admin'::text, 'api'::text, 'auth'::text, 'platform'::text, 'new'::text, 'settings'::text]))))),
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
    CONSTRAINT organization_invites_email_nonempty_chk CHECK ((length(btrim(email)) > 0)),
    CONSTRAINT organization_invites_max_uses_chk CHECK ((max_uses > 0)),
    CONSTRAINT organization_invites_role_chk CHECK ((role = 'member'::text)),
    CONSTRAINT organization_invites_token_hash_nonempty_chk CHECK ((length(btrim(token_hash)) > 0)),
    CONSTRAINT organization_invites_usage_bounds_chk CHECK ((used_count <= max_uses)),
    CONSTRAINT organization_invites_used_count_chk CHECK ((used_count >= 0))
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
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_hash text NOT NULL,
    auth_method text DEFAULT 'password'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
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
    CONSTRAINT trajectories_failed_at_chk CHECK ((((status = 'failed'::text) AND (failed_at IS NOT NULL)) OR ((status <> 'failed'::text) AND (failed_at IS NULL)))),
    CONSTRAINT trajectories_status_chk CHECK ((status = ANY (ARRAY['accepted'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: trajectory_constraints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trajectory_constraints (
    trajectory_id uuid NOT NULL,
    seq integer NOT NULL,
    point_type text NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    direction double precision,
    relative_timestamp integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trajectory_constraints_point_type_chk CHECK ((point_type = ANY (ARRAY['start'::text, 'waypoint'::text, 'goal'::text]))),
    CONSTRAINT trajectory_constraints_point_type_timestamp_chk CHECK ((((point_type = 'waypoint'::text) AND (relative_timestamp IS NOT NULL)) OR ((point_type = ANY (ARRAY['start'::text, 'goal'::text])) AND (relative_timestamp IS NULL)))),
    CONSTRAINT trajectory_constraints_relative_timestamp_chk CHECK (((relative_timestamp IS NULL) OR (relative_timestamp >= 0))),
    CONSTRAINT trajectory_constraints_seq_chk CHECK ((seq >= 0))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    global_role text DEFAULT 'none'::text NOT NULL,
    password_must_change boolean DEFAULT true NOT NULL,
    password_changed_at timestamp with time zone,
    temporary_password_expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    CONSTRAINT users_display_name_nonempty_chk CHECK ((length(btrim(display_name)) > 0)),
    CONSTRAINT users_email_nonempty_chk CHECK ((length(btrim(email)) > 0)),
    CONSTRAINT users_password_hash_nonempty_chk CHECK ((length(btrim(password_hash)) > 0)),
    CONSTRAINT users_global_role_chk CHECK ((global_role = ANY (ARRAY['none'::text, 'admin'::text])))
);


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
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (organization_id, user_id);


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
-- Name: organization_invites organization_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_token_hash_key UNIQUE (token_hash);


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
-- Name: pedestrians pedestrians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedestrians
    ADD CONSTRAINT pedestrians_pkey PRIMARY KEY (id);


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
-- Name: trajectory_constraints trajectory_constraints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trajectory_constraints
    ADD CONSTRAINT trajectory_constraints_pkey PRIMARY KEY (trajectory_id, seq);


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
-- Name: auth_identities_one_google_identity_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_identities_one_google_identity_per_user ON public.auth_identities USING btree (provider, user_id) WHERE (provider = 'google'::text);


--
-- Name: auth_identities_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_identities_user_id_idx ON public.auth_identities USING btree (user_id);


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
-- Name: organization_memberships_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_user_id_idx ON public.organization_memberships USING btree (user_id);


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
-- Name: organization_invites_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_organization_id_idx ON public.organization_invites USING btree (organization_id);


--
-- Name: pedestrians_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedestrians_organization_id_idx ON public.pedestrians USING btree (organization_id);


--
-- Name: recordings_floor_id_created_at_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_floor_id_created_at_active_idx ON public.recordings USING btree (floor_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: recordings_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_organization_id_idx ON public.recordings USING btree (organization_id);


--
-- Name: recordings_pedestrian_id_created_at_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_pedestrian_id_created_at_active_idx ON public.recordings USING btree (pedestrian_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_revoked_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_revoked_at_idx ON public.sessions USING btree (revoked_at);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: trajectories_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_organization_id_idx ON public.trajectories USING btree (organization_id);


--
-- Name: trajectories_recording_id_created_at_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_recording_id_created_at_active_idx ON public.trajectories USING btree (recording_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: trajectories_status_created_at_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_status_created_at_active_idx ON public.trajectories USING btree (status, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: trajectory_constraints_trajectory_id_seq_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectory_constraints_trajectory_id_seq_idx ON public.trajectory_constraints USING btree (trajectory_id, seq);


--
-- Name: buildings set_updated_at_buildings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_auth_identities BEFORE UPDATE ON public.auth_identities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: buildings set_updated_at_buildings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_buildings BEFORE UPDATE ON public.buildings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: floors set_updated_at_floors; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_floors BEFORE UPDATE ON public.floors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_memberships set_updated_at_organization_memberships; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_memberships BEFORE UPDATE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_creation_requests set_updated_at_organization_creation_requests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_creation_requests BEFORE UPDATE ON public.organization_creation_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_invites set_updated_at_organization_invites; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organization_invites BEFORE UPDATE ON public.organization_invites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: trajectories set_updated_at_trajectories; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trajectories BEFORE UPDATE ON public.trajectories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: trajectory_constraints set_updated_at_trajectory_constraints; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trajectory_constraints BEFORE UPDATE ON public.trajectory_constraints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users set_updated_at_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: buildings buildings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
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
-- Name: organization_invites organization_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


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
-- Name: trajectory_constraints trajectory_constraints_trajectory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trajectory_constraints
    ADD CONSTRAINT trajectory_constraints_trajectory_id_fkey FOREIGN KEY (trajectory_id) REFERENCES public.trajectories(id) ON DELETE RESTRICT;


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
    ('20260610070000');
