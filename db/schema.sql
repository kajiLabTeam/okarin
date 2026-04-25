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
-- Name: buildings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buildings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
    CONSTRAINT floors_image_object_path_format_chk CHECK ((image_object_path ~ '^maps/[0-9a-fA-F-]+/[0-9a-fA-F-]+\.(svg|png)$'::text))
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: pedestrians pedestrians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedestrians
    ADD CONSTRAINT pedestrians_pkey PRIMARY KEY (id);


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
-- Name: floors_building_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX floors_building_id_idx ON public.floors USING btree (building_id);


--
-- Name: recordings_floor_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_floor_id_created_at_idx ON public.recordings USING btree (floor_id, created_at DESC);


--
-- Name: recordings_pedestrian_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordings_pedestrian_id_created_at_idx ON public.recordings USING btree (pedestrian_id, created_at DESC);


--
-- Name: trajectories_recording_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_recording_id_created_at_idx ON public.trajectories USING btree (recording_id, created_at DESC);


--
-- Name: trajectories_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectories_status_created_at_idx ON public.trajectories USING btree (status, created_at DESC);


--
-- Name: trajectory_constraints_trajectory_id_seq_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trajectory_constraints_trajectory_id_seq_idx ON public.trajectory_constraints USING btree (trajectory_id, seq);


--
-- Name: buildings set_updated_at_buildings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_buildings BEFORE UPDATE ON public.buildings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: floors set_updated_at_floors; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_floors BEFORE UPDATE ON public.floors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: floors floors_building_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.floors
    ADD CONSTRAINT floors_building_id_fkey FOREIGN KEY (building_id) REFERENCES public.buildings(id) ON DELETE RESTRICT;


--
-- Name: recordings recordings_floor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.floors(id) ON DELETE RESTRICT;


--
-- Name: recordings recordings_pedestrian_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_pedestrian_id_fkey FOREIGN KEY (pedestrian_id) REFERENCES public.pedestrians(id) ON DELETE RESTRICT;


--
-- Name: trajectories trajectories_floor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trajectories
    ADD CONSTRAINT trajectories_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.floors(id) ON DELETE RESTRICT;


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
    ('20260425120000');
