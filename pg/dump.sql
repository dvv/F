--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = off;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET escape_string_warning = off;

SET search_path = public, pg_catalog;

--
-- Name: object; Type: TYPE; Schema: public; Owner: dvv
--

CREATE TYPE object AS (
	id bigint,
	user_id bigint,
	path bigint[]
);


ALTER TYPE public.object OWNER TO dvv;

--
-- Name: get_objects(integer); Type: FUNCTION; Schema: public; Owner: dvv
--

CREATE FUNCTION get_objects(integer) RETURNS SETOF object
    LANGUAGE sql
    AS $_$
-- $1 - user access level
WITH RECURSIVE obj_tree AS (
  SELECT o.*, ARRAY[o.id] AS path
    FROM objects o
    WHERE o.ref_id IS NULL AND o.access <= $1
  UNION ALL
    SELECT t.*, tt.path || t.id AS path
    FROM objects t
    JOIN obj_tree tt ON t.ref_id = tt.id
    WHERE t.access <= $1
)
SELECT id, user_id, path FROM obj_tree;
$_$;


ALTER FUNCTION public.get_objects(integer) OWNER TO dvv;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: objects; Type: TABLE; Schema: public; Owner: dvv; Tablespace: 
--

CREATE TABLE objects (
    id bigint NOT NULL,
    ref_id bigint,
    access smallint DEFAULT 0 NOT NULL,
    user_id bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.objects OWNER TO dvv;

--
-- Name: v_object_parents(bigint); Type: FUNCTION; Schema: public; Owner: dvv
--

CREATE FUNCTION v_object_parents(id bigint) RETURNS SETOF objects
    LANGUAGE sql
    AS $_$WITH RECURSIVE obj_parents AS (
	SELECT id, ref_id, ARRAY[id] path
		FROM objects
		WHERE ref_id = $1
	UNION ALL
	SELECT t.id, t.ref_id, tt.path || t.id path
		FROM objects t
		JOIN obj_parents tt ON t.ref_id = tt.id 
)
SELECT id, ref_id
	FROM obj_parents
$_$;


ALTER FUNCTION public.v_object_parents(id bigint) OWNER TO dvv;

--
-- Name: objects_id_seq; Type: SEQUENCE; Schema: public; Owner: dvv
--

CREATE SEQUENCE objects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.objects_id_seq OWNER TO dvv;

--
-- Name: objects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dvv
--

ALTER SEQUENCE objects_id_seq OWNED BY objects.id;


--
-- Name: posts; Type: TABLE; Schema: public; Owner: dvv; Tablespace: 
--

CREATE TABLE posts (
    title text,
    body text
)
INHERITS (objects);


ALTER TABLE public.posts OWNER TO dvv;

--
-- Name: tags; Type: TABLE; Schema: public; Owner: dvv; Tablespace: 
--

CREATE TABLE tags (
    id bigint NOT NULL,
    obj_id bigint NOT NULL,
    tag character varying(32) NOT NULL
);


ALTER TABLE public.tags OWNER TO dvv;

--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: public; Owner: dvv
--

CREATE SEQUENCE tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.tags_id_seq OWNER TO dvv;

--
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dvv
--

ALTER SEQUENCE tags_id_seq OWNED BY tags.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: dvv; Tablespace: 
--

CREATE TABLE users (
    id integer NOT NULL,
    name character varying(64),
    openid text
);


ALTER TABLE public.users OWNER TO dvv;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: dvv
--

CREATE SEQUENCE users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO dvv;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dvv
--

ALTER SEQUENCE users_id_seq OWNED BY users.id;


--
-- Name: v_object_tree; Type: VIEW; Schema: public; Owner: dvv
--

CREATE VIEW v_object_tree AS
    WITH RECURSIVE obj_tree AS (SELECT objects.id, objects.ref_id, ARRAY[objects.id] AS path FROM objects WHERE (objects.ref_id IS NULL) UNION ALL SELECT t.id, t.ref_id, (tt.path || t.id) AS path FROM (objects t JOIN obj_tree tt ON ((t.ref_id = tt.id)))) SELECT obj_tree.id, obj_tree.path FROM obj_tree;


ALTER TABLE public.v_object_tree OWNER TO dvv;

--
-- Name: v_objects; Type: VIEW; Schema: public; Owner: dvv
--

CREATE VIEW v_objects AS
    SELECT get_objects.id, get_objects.user_id, get_objects.path FROM get_objects(0) get_objects(id, user_id, path);


ALTER TABLE public.v_objects OWNER TO dvv;

--
-- Name: v_tree; Type: VIEW; Schema: public; Owner: dvv
--

CREATE VIEW v_tree AS
    WITH RECURSIVE obj_tree AS (SELECT objects.id, objects.ref_id, objects.access, ARRAY[objects.id] AS path FROM objects WHERE (objects.ref_id IS NULL) UNION ALL SELECT t.id, t.ref_id, t.access, (tt.path || t.id) AS path FROM (objects t JOIN obj_tree tt ON ((t.ref_id = tt.id)))) SELECT obj_tree.id, obj_tree.ref_id, obj_tree.access, obj_tree.path FROM obj_tree;


ALTER TABLE public.v_tree OWNER TO dvv;

--
-- Name: votes; Type: TABLE; Schema: public; Owner: dvv; Tablespace: 
--

CREATE TABLE votes (
    value smallint DEFAULT 1 NOT NULL
)
INHERITS (objects);


ALTER TABLE public.votes OWNER TO dvv;

--
-- Name: id; Type: DEFAULT; Schema: public; Owner: dvv
--

ALTER TABLE objects ALTER COLUMN id SET DEFAULT nextval('objects_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: dvv
--

ALTER TABLE tags ALTER COLUMN id SET DEFAULT nextval('tags_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: dvv
--

ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq'::regclass);


--
-- Name: objects_pkey; Type: CONSTRAINT; Schema: public; Owner: dvv; Tablespace: 
--

ALTER TABLE ONLY objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: tags_pkey; Type: CONSTRAINT; Schema: public; Owner: dvv; Tablespace: 
--

ALTER TABLE ONLY tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: users_pkey; Type: CONSTRAINT; Schema: public; Owner: dvv; Tablespace: 
--

ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: votes_ref_user; Type: CONSTRAINT; Schema: public; Owner: dvv; Tablespace: 
--

ALTER TABLE ONLY votes
    ADD CONSTRAINT votes_ref_user UNIQUE (ref_id, user_id);


--
-- Name: object_user; Type: INDEX; Schema: public; Owner: dvv; Tablespace: 
--

CREATE INDEX object_user ON objects USING btree (user_id);


--
-- Name: objects_ref; Type: INDEX; Schema: public; Owner: dvv; Tablespace: 
--

CREATE INDEX objects_ref ON objects USING btree (ref_id);


--
-- Name: tags_obj; Type: INDEX; Schema: public; Owner: dvv; Tablespace: 
--

CREATE INDEX tags_obj ON tags USING btree (obj_id);


--
-- Name: tags_tag; Type: INDEX; Schema: public; Owner: dvv; Tablespace: 
--

CREATE INDEX tags_tag ON tags USING btree (tag);


--
-- Name: objects_user; Type: FK CONSTRAINT; Schema: public; Owner: dvv
--

ALTER TABLE ONLY objects
    ADD CONSTRAINT objects_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM postgres;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

