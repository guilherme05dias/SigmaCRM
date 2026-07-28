-- The UAZAPI webhook writes through PostgREST as service_role. The contact
-- phone normalization trigger lives in the private schema, so inserts need
-- explicit access to the schema and both functions in the trigger chain.
grant usage on schema private to service_role;

grant execute on function private.canonical_brazil_phone(text) to service_role;
grant execute on function private.normalize_contact_phone_before_write() to service_role;
