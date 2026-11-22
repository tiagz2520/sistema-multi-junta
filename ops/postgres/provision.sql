SET LOCAL search_path = pg_catalog;

DO $provision$
DECLARE
  database_id oid;
  role_name text;
  role_definition pg_roles%ROWTYPE;
  app_role_id oid;
  migrator_role_id oid;
  identity_role_id oid;
  app_schema_id oid;
  app_schema_owner oid;
  owned_object pg_shdepend%ROWTYPE;
BEGIN
  IF current_database() IN ('postgres', 'template0', 'template1') THEN
    RAISE EXCEPTION 'Selecciona una base de datos dedicada a Sistema Multi-Junta.';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
    RAISE EXCEPTION 'El aprovisionamiento debe ejecutarse con el administrador de PostgreSQL.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('multi-junta:postgres-roles', 0));
  SELECT oid INTO STRICT database_id FROM pg_database WHERE datname = current_database();

  FOREACH role_name IN ARRAY ARRAY['multi_junta_app', 'multi_junta_migrator', 'multi_junta_identity'] LOOP
    SELECT * INTO role_definition FROM pg_roles WHERE rolname = role_name;

    IF NOT FOUND THEN
      EXECUTE format(
        'CREATE ROLE %I %s NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT NOREPLICATION',
        role_name,
        CASE WHEN role_name = 'multi_junta_identity' THEN 'NOLOGIN' ELSE 'LOGIN' END
      );
    ELSIF role_definition.rolsuper OR role_definition.rolbypassrls
       OR role_definition.rolcreaterole OR role_definition.rolcreatedb
       OR role_definition.rolinherit OR role_definition.rolreplication
       OR role_definition.rolcanlogin <> (role_name <> 'multi_junta_identity') THEN
      RAISE EXCEPTION 'El rol % existe con atributos incompatibles con su uso en Multi-Junta.', role_name;
    END IF;
  END LOOP;

  SELECT oid INTO STRICT app_role_id FROM pg_roles WHERE rolname = 'multi_junta_app';
  SELECT oid INTO STRICT migrator_role_id FROM pg_roles WHERE rolname = 'multi_junta_migrator';
  SELECT oid INTO STRICT identity_role_id FROM pg_roles WHERE rolname = 'multi_junta_identity';

  IF EXISTS (
    SELECT FROM pg_auth_members
    WHERE (
      roleid IN (app_role_id, migrator_role_id, identity_role_id)
      OR member IN (app_role_id, migrator_role_id, identity_role_id)
    ) AND NOT (
      roleid = identity_role_id AND member = migrator_role_id
      AND set_option AND NOT inherit_option AND NOT admin_option
    )
  ) THEN
    RAISE EXCEPTION 'Los roles Multi-Junta tienen una membresía incompatible.';
  END IF;

  GRANT multi_junta_identity TO multi_junta_migrator
    WITH SET TRUE, INHERIT FALSE, ADMIN FALSE;

  SELECT oid, nspowner INTO app_schema_id, app_schema_owner
  FROM pg_namespace WHERE nspname = 'multi_junta';

  IF FOUND AND app_schema_owner <> migrator_role_id THEN
    RAISE EXCEPTION 'El esquema multi_junta ya existe con un propietario distinto del migrador.';
  END IF;

  IF EXISTS (
    SELECT FROM pg_shdepend
    WHERE refclassid = 'pg_authid'::regclass AND refobjid = app_role_id AND deptype = 'o'
  ) THEN
    RAISE EXCEPTION 'multi_junta_app ya es propietario de objetos en PostgreSQL.';
  END IF;

  FOR owned_object IN
    SELECT * FROM pg_shdepend
    WHERE refclassid = 'pg_authid'::regclass AND refobjid = migrator_role_id AND deptype = 'o'
  LOOP
    IF owned_object.dbid = database_id THEN
      IF owned_object.classid = 'pg_namespace'::regclass AND owned_object.objid = app_schema_id THEN
        CONTINUE;
      END IF;
      IF owned_object.classid = 'pg_default_acl'::regclass AND EXISTS (
        SELECT FROM pg_default_acl
        WHERE oid = owned_object.objid AND defaclrole = migrator_role_id
          AND defaclnamespace IN (0, app_schema_id)
      ) THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT FROM pg_identify_object(owned_object.classid, owned_object.objid, owned_object.objsubid)
        WHERE schema = 'multi_junta'
      ) THEN
        CONTINUE;
      END IF;
    END IF;
    RAISE EXCEPTION 'multi_junta_migrator ya es propietario de objetos fuera de su esquema dedicado.';
  END LOOP;

  IF EXISTS (
    SELECT FROM pg_shdepend AS ownership
    WHERE ownership.refclassid = 'pg_authid'::regclass
      AND ownership.refobjid = identity_role_id AND ownership.deptype = 'o'
      AND NOT (
        ownership.dbid = database_id AND ownership.classid = 'pg_proc'::regclass AND EXISTS (
          SELECT FROM pg_proc AS routine
          WHERE routine.oid = ownership.objid AND routine.pronamespace = app_schema_id
            AND routine.proname IN (
              'auth_attempt', 'auth_credential', 'auth_live_session', 'auth_start',
              'auth_validate', 'auth_contexts', 'auth_switch', 'auth_logout',
              'auth_own_credential', 'auth_password', 'auth_membership'
            )
        )
      )
  ) THEN
    RAISE EXCEPTION 'multi_junta_identity ya es propietario de objetos ajenos a las rutinas de identidad.';
  END IF;

  IF EXISTS (
    SELECT FROM pg_default_acl AS default_acl
    CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) AS acl
    WHERE default_acl.defaclrole = migrator_role_id
      AND default_acl.defaclobjtype IN ('r', 'S')
      AND acl.grantee IN (0, app_role_id, identity_role_id)
  ) THEN
    RAISE EXCEPTION 'Hay permisos predeterminados de tablas o secuencias incompatibles con el proyecto.';
  END IF;

  EXECUTE format(
    'REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC, multi_junta_app, multi_junta_migrator, multi_junta_identity',
    current_database()
  );
  EXECUTE format('REVOKE GRANT OPTION FOR CONNECT ON DATABASE %I FROM multi_junta_app', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO multi_junta_app, multi_junta_migrator', current_database());

  REVOKE CREATE, USAGE ON SCHEMA public FROM PUBLIC, multi_junta_app, multi_junta_migrator, multi_junta_identity;

  IF app_schema_id IS NULL THEN
    CREATE SCHEMA multi_junta AUTHORIZATION multi_junta_migrator;
  END IF;

  REVOKE ALL ON SCHEMA multi_junta FROM PUBLIC;
  REVOKE CREATE ON SCHEMA multi_junta FROM multi_junta_app, multi_junta_identity;
  REVOKE GRANT OPTION FOR USAGE ON SCHEMA multi_junta FROM multi_junta_app, multi_junta_identity;
  GRANT USAGE ON SCHEMA multi_junta TO multi_junta_app, multi_junta_identity;

  IF has_schema_privilege(app_role_id, 'public', 'USAGE')
     OR has_database_privilege(app_role_id, database_id, 'CREATE, TEMPORARY') OR EXISTS (
    SELECT FROM pg_namespace WHERE has_schema_privilege(app_role_id, oid, 'CREATE')
  ) THEN
    RAISE EXCEPTION 'multi_junta_app conserva permisos incompatibles con la ejecución restringida.';
  END IF;

  IF has_database_privilege(migrator_role_id, database_id, 'CREATE, TEMPORARY') OR EXISTS (
    SELECT FROM pg_namespace
    WHERE nspname <> 'multi_junta' AND has_schema_privilege(migrator_role_id, oid, 'CREATE')
  ) THEN
    RAISE EXCEPTION 'multi_junta_migrator conserva permisos de creación fuera de su esquema dedicado.';
  END IF;

  IF has_schema_privilege(identity_role_id, 'public', 'USAGE')
     OR has_database_privilege(identity_role_id, database_id, 'CREATE, TEMPORARY') OR EXISTS (
    SELECT FROM pg_namespace WHERE has_schema_privilege(identity_role_id, oid, 'CREATE')
  ) THEN
    RAISE EXCEPTION 'multi_junta_identity conserva permisos incompatibles con las rutinas de identidad.';
  END IF;
END
$provision$;

-- Los permisos de ejecución de rutinas también se conceden por objeto desde las migraciones.
ALTER DEFAULT PRIVILEGES FOR ROLE multi_junta_migrator REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

SET LOCAL password_encryption = 'scram-sha-256';
\password multi_junta_app
\password multi_junta_migrator

DO $verify_passwords$
BEGIN
  IF EXISTS (
    SELECT FROM pg_authid
    WHERE rolname IN ('multi_junta_app', 'multi_junta_migrator')
      AND (rolpassword IS NULL OR rolpassword NOT LIKE 'SCRAM-SHA-256$%')
  ) THEN
    RAISE EXCEPTION 'No se pudieron guardar los verificadores SCRAM de los roles Multi-Junta.';
  END IF;
END
$verify_passwords$;
