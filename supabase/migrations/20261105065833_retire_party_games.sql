-- Retire the eight standalone party/arcade modes from new room creation.
-- Existing rooms keep their state and gameplay RPCs so active matches and history remain intact.
REVOKE EXECUTE ON FUNCTION public.create_party_room_secure(character varying, character varying, character varying, integer, integer, text[], boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_parkur_room_secure(character varying, character varying, character varying, integer, integer, text[], boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_kivilcim_room_secure(character varying, character varying, character varying, integer, integer, text[], boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_kizilkure_room_secure(character varying, character varying, character varying, integer, integer, text[], boolean, text, text) FROM PUBLIC, anon, authenticated;
