# IJ Ship Tracker

Browser-first MVP voor het registreren van scheepspassages op het IJ.

## Wat zit erin

- Next.js publieke read-only viewer.
- Lokale `/capture` pagina voor browsercamera.
- Python FastAPI detector met lichte OpenCV motion-mode, optionele YOLO/ONNX scheepsdetectie en eenvoudige centroid tracking.
- PostgreSQL/PostGIS schema voor passages, schepen, foto’s en latere AIS-posities.
- Beveiligde sync-routes voor passage-events en snapshot uploads naar Supabase.
- Netlify-config voor de publieke viewer.

## Lokaal starten

```bash
cp .env.example .env.local
docker compose up --build
npm run dev
```

Open daarna:

- `http://localhost:3003` voor de viewer.
- `http://localhost:3003/capture` voor de lokale camera.
- `http://localhost:8000/health` voor de detector.
- `http://localhost:8001/health` voor de YOLO scheepsdetector.

Zonder `DATABASE_URL` leest de viewer uit Supabase wanneer `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` gezet zijn; anders toont de app demo-data. Met Docker Compose gebruikt de detector de lokale Postgres database.

## Supabase setup

1. Maak een Supabase-project.
2. Voer `supabase/schema.sql` uit in de SQL editor.
3. Zet in Netlify:
   - `DATABASE_URL` naar de Supabase transaction-pooler connection string.
   - `SUPABASE_URL`.
   - `SUPABASE_SERVICE_ROLE_KEY`.
   - `SYNC_SHARED_SECRET`.
4. Houd `SUPABASE_SERVICE_ROLE_KEY` server-side. Zet die nooit als `NEXT_PUBLIC_` variabele.

## Detector

De detector gebruikt lokaal standaard `DETECTION_MODE=motion`, zodat de technische camera-pipeline snel getest kan worden zonder zware AI-download. Motion-mode is niet ship-specific en registreert daarom standaard geen passages.

Voor echte scheepsdetectie start Docker ook `detector-yolo` op poort `8001`. Deze gebruikt OpenCV DNN met `yolov5n.onnx` en registreert alleen COCO `boat` detecties. Relevante env vars:

- `WATER_ROI`: genormaliseerde waterzone, standaard `0,0.35,1,1`.
- `CONFIDENCE_THRESHOLD`: standaard `0.45`.
- `MIN_TRACK_FRAMES`: aantal frames voordat een passage telt.
- `MIN_TRACK_DISPLACEMENT`: minimale verplaatsing in pixels voordat een track als passage telt. Dit voorkomt registratie van statische objecten, zoals gebouwen of kade-objecten, die per ongeluk als `boat` worden herkend.
- `MOTION_MIN_AREA`: minimale bewegingscontour voor lokale motion-mode, standaard in Compose `1000`.
- `TRACK_TTL_SECONDS`: hoe lang een track zonder nieuwe detectie mag blijven bestaan, standaard in Compose `15`.
- `REGISTERED_TRACK_TTL_SECONDS`: hoe lang een al vastgelegde track detecties blijft absorberen, standaard in Compose `45`. Dit voorkomt dat hetzelfde schip tijdens dezelfde passage opnieuw wordt vastgelegd.
- `MIN_CENTER_SCORE`: voorkeursscore voor centrering (0-1). Gecentreerde schepen worden eerder gelogd, maar bewegende schepen die niet in het midden komen worden ook vastgelegd.
- `CENTER_ZONE_X` / `CENTER_ZONE_Y`: zone waarvoor centrering een bonus geeft bij framekeuze, standaard `0.1,0.9` horizontaal en `0.35,0.95` verticaal.
- `PASSAGE_COOLDOWN_SECONDS`: cooldown na registratie om dubbele passages van hetzelfde schip te voorkomen, standaard `60`.
- `PASSAGE_COOLDOWN_X_DISTANCE`: maximale afstand in pixels tussen start- én eindpositie om twee passages als hetzelfde schip te zien, standaard `80`.
- `DETECTION_MODE`: `motion` voor debug, `yolo` voor echte scheepsdetectie.
- `REGISTER_MOTION_PASSAGES`: standaard `false`; alleen op `true` zetten voor technische tests, want beweging is geen scheepsherkenning.
- `YOLO_MODEL`: ONNX modelpad wanneer `DETECTION_MODE=yolo` gebruikt wordt.

Na detectie classificeert de detector het schip met eenvoudige bbox-heuristieken in `pleasure_craft` (zeil-/pleziervaart), `cargo` of `other`. Drempels zijn instelbaar via `CARGO_MIN_WIDTH_RATIO`, `CARGO_MIN_AREA_RATIO`, `SMALL_MAX_WIDTH_RATIO` en `SAIL_MAX_ASPECT_RATIO`.

## MVP-grenzen

- Geen echte livestream, alleen snapshots.
- Geen AIS-koppeling in fase 1.
- Geen eigen modeltraining.
- Geen publieke write-acties.
