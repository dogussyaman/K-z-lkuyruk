BEGIN;
CREATE TEMP TABLE edge_results(test text,result text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.make_party(mode_n text,n integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE h uuid; r uuid; c text; i integer;
BEGIN
 SELECT id INTO h FROM auth.users ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',h::text,true);
 c:=upper(substr(md5(gen_random_uuid()::text),1,6));
 SELECT room_id INTO r FROM public.create_party_room_secure(c::varchar,'Edge fixture','fox',5,40,'{}',false,null,mode_n);
 FOR i IN 1..n-1 LOOP PERFORM public.add_test_bot_secure(c::varchar,'balanced'); END LOOP;
 PERFORM public.party_start_secure(c); RETURN r;
END $$;
DO $$
DECLARE r uuid; c text; s kizilkuyruk_private.sessions; p record; fox uuid; keeper uuid; buyer uuid; seller uuid; other_buyer uuid; failed boolean; i integer; scene_n integer;
BEGIN
 -- Timeouts must terminate a fully idle match, even without a question screen.
 r:=pg_temp.make_party('tilki_soygunu',4); SELECT code INTO c FROM public.rooms WHERE id=r;
 FOR i IN 1..6 LOOP
  SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
  EXIT WHEN s.phase='finished';
  UPDATE kizilkuyruk_private.sessions SET deadline=now()-interval '1 second' WHERE room_id=r;
  PERFORM public.party_advance_secure(c,s.step);
 END LOOP;
 IF (SELECT phase FROM kizilkuyruk_private.sessions WHERE room_id=r)<>'finished' OR EXISTS(SELECT 1 FROM kizilkuyruk_private.players WHERE room_id=r AND score<>0) THEN RAISE EXCEPTION 'Alarm timeout did not end the game'; END IF;
 INSERT INTO edge_results VALUES('Idle heist terminates at three alarms','PASS');

 r:=pg_temp.make_party('kilit_altinda',3); SELECT code INTO c FROM public.rooms WHERE id=r;
 FOR i IN 1..6 LOOP
  SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
  EXIT WHEN s.phase='finished';
  UPDATE kizilkuyruk_private.sessions SET deadline=now()-interval '1 second' WHERE room_id=r;
  PERFORM public.party_advance_secure(c,s.step);
 END LOOP;
 IF (SELECT phase FROM kizilkuyruk_private.sessions WHERE room_id=r)<>'finished' OR (SELECT public_state->>'errors' FROM kizilkuyruk_private.sessions WHERE room_id=r)<>'3' THEN RAISE EXCEPTION 'Idle lock match did not terminate'; END IF;
 INSERT INTO edge_results VALUES('Idle cooperative match terminates after three errors','PASS');

 r:=pg_temp.make_party('kizil_pakt',8); SELECT code INTO c FROM public.rooms WHERE id=r;
 IF (SELECT count(*) FROM kizilkuyruk_private.players WHERE room_id=r AND data->>'role'='fox')<>2 THEN RAISE EXCEPTION 'Eight-player role allocation wrong'; END IF;
 SELECT player_id INTO fox FROM kizilkuyruk_private.players WHERE room_id=r AND data->>'role'='fox' LIMIT 1;
 SELECT player_id INTO keeper FROM kizilkuyruk_private.players WHERE room_id=r AND data->>'role'='keeper' LIMIT 1;
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
 failed:=false;
 BEGIN PERFORM kizilkuyruk_private.submit(r,keeper,s.step,'{"choice":"sabotage","site":0,"claim":0}'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Keeper could sabotage'; END IF;
 FOR p IN SELECT * FROM kizilkuyruk_private.players WHERE room_id=r LOOP
  PERFORM kizilkuyruk_private.submit(r,p.player_id,s.step,jsonb_build_object('choice',CASE p.data->>'role' WHEN 'fox' THEN 'sabotage' WHEN 'keeper' THEN 'protect' ELSE 'work' END,'site',0,'claim',CASE WHEN p.data->>'role'='fox' THEN 1 ELSE 0 END));
 END LOOP;
 IF (SELECT public_state->>'damage' FROM kizilkuyruk_private.sessions WHERE room_id=r)<>'0' THEN RAISE EXCEPTION 'Protection failed'; END IF;
 PERFORM public.party_advance_secure(c,(SELECT step FROM kizilkuyruk_private.sessions WHERE room_id=r));
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
 FOR p IN SELECT * FROM kizilkuyruk_private.players WHERE room_id=r LOOP
  PERFORM kizilkuyruk_private.submit(r,p.player_id,s.step,jsonb_build_object('target',CASE WHEN p.player_id=fox THEN keeper ELSE fox END));
 END LOOP;
 IF NOT (SELECT (data->>'exposed')::boolean FROM kizilkuyruk_private.players WHERE room_id=r AND player_id=fox) THEN RAISE EXCEPTION 'Majority did not expose fox'; END IF;
 IF (SELECT count(*) FROM kizilkuyruk_private.players WHERE room_id=r)<>8 THEN RAISE EXCEPTION 'Voting eliminated a participant'; END IF;
 PERFORM public.party_advance_secure(c,(SELECT step FROM kizilkuyruk_private.sessions WHERE room_id=r));
 failed:=false;
 BEGIN PERFORM kizilkuyruk_private.submit(r,fox,(SELECT step FROM kizilkuyruk_private.sessions WHERE room_id=r),'{"choice":"sabotage","site":0,"claim":0}'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Exposed fox could sabotage'; END IF;
 INSERT INTO edge_results VALUES('Protection, role permissions, majority, non-elimination and exposed-role restrictions','PASS');

 r:=pg_temp.make_party('gece_pazari',3); SELECT code INTO c FROM public.rooms WHERE id=r;
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
 seller:=(s.public_state->>'seller')::uuid;
 PERFORM kizilkuyruk_private.submit(r,seller,s.step,'{"text":"Sandık açıklaması"}');
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
 FOR p IN SELECT * FROM kizilkuyruk_private.players WHERE room_id=r AND player_id<>seller LOOP
  PERFORM kizilkuyruk_private.submit(r,p.player_id,s.step,'{"bid":4}');
 END LOOP;
 IF EXISTS(SELECT 1 FROM kizilkuyruk_private.players WHERE room_id=r AND (data->>'coins')::integer<>12) THEN RAISE EXCEPTION 'Tie spent money'; END IF;
 PERFORM public.party_advance_secure(c,(SELECT step FROM kizilkuyruk_private.sessions WHERE room_id=r));
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r; seller:=(s.public_state->>'seller')::uuid;
 PERFORM kizilkuyruk_private.submit(r,seller,s.step,'{"text":"İkinci sandık"}');
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
 UPDATE kizilkuyruk_private.sessions SET secret=secret||'{"value":6}' WHERE room_id=r;
 SELECT player_id INTO buyer FROM kizilkuyruk_private.players WHERE room_id=r AND player_id<>seller LIMIT 1;
 SELECT player_id INTO other_buyer FROM kizilkuyruk_private.players WHERE room_id=r AND player_id NOT IN (seller,buyer) LIMIT 1;
 failed:=false;
 BEGIN PERFORM kizilkuyruk_private.submit(r,buyer,s.step,'{"bid":9999}'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Overdraft accepted'; END IF;
 PERFORM kizilkuyruk_private.submit(r,buyer,s.step,'{"bid":4}');
 PERFORM kizilkuyruk_private.submit(r,other_buyer,s.step,'{"bid":2}');
 IF (SELECT (data->>'coins')::integer FROM kizilkuyruk_private.players WHERE room_id=r AND player_id=buyer)<>8 OR (SELECT (data->>'assets_value')::integer FROM kizilkuyruk_private.players WHERE room_id=r AND player_id=buyer)<>6 THEN RAISE EXCEPTION 'Buyer accounting wrong'; END IF;
 IF (SELECT (data->>'coins')::integer FROM kizilkuyruk_private.players WHERE room_id=r AND player_id=seller)<>15 THEN RAISE EXCEPTION 'Commission accounting wrong'; END IF;
 INSERT INTO edge_results VALUES('Auction ties, overdraft prevention, buyer assets and seller commission','PASS');

 FOR i IN 0..1 LOOP
  r:=pg_temp.make_party('kayip_kare',4); SELECT code INTO c FROM public.rooms WHERE id=r;
  SELECT player_id INTO fox FROM kizilkuyruk_private.players WHERE room_id=r AND data->>'role'='impostor';
  SELECT player_id INTO keeper FROM kizilkuyruk_private.players WHERE room_id=r AND player_id<>fox LIMIT 1;
  PERFORM kizilkuyruk_private.stage(r,'vote');
  SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
  FOR p IN SELECT * FROM kizilkuyruk_private.players WHERE room_id=r LOOP
   PERFORM kizilkuyruk_private.submit(r,p.player_id,s.step,jsonb_build_object('target',CASE WHEN p.player_id=fox THEN keeper ELSE fox END));
  END LOOP;
  PERFORM public.party_advance_secure(c,(SELECT step FROM kizilkuyruk_private.sessions WHERE room_id=r));
  SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
  IF s.phase<>'last_guess' THEN RAISE EXCEPTION 'Caught impostor did not get a last guess'; END IF;
  scene_n:=((s.secret->>'scene')::integer+i)%6;
  PERFORM kizilkuyruk_private.submit(r,fox,s.step,jsonb_build_object('scene',scene_n));
  IF (SELECT fox=ANY(winners) FROM kizilkuyruk_private.sessions WHERE room_id=r)<>(i=0) THEN RAISE EXCEPTION 'Last-guess winner wrong'; END IF;
 END LOOP;
 INSERT INTO edge_results VALUES('Visual impostor caught: correct and incorrect last-guess outcomes','PASS');
END $$;
SELECT * FROM edge_results;
ROLLBACK;
