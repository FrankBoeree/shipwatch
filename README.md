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
- `MIN_TRACK_FRAMES`: aantal frames voordat een passage telt, standaard `3`.
- `FALLBACK_MIN_TRACK_FRAMES`: minimumaantal frames voor het vangnet, standaard `2`. Tracks die uit beeld verdwijnen zonder aan de normale criteria te voldoen (snelle schepen, schepen die nooit volledig in beeld waren) worden bij verloop alsnog één keer geregistreerd.
- `MIN_TRACK_DISPLACEMENT`: minimale verplaatsing in pixels voordat een track als passage telt. Dit voorkomt registratie van statische objecten, zoals gebouwen of kade-objecten, die per ongeluk als `boat` worden herkend.
- `MOTION_MIN_AREA`: minimale bewegingscontour voor lokale motion-mode, standaard in Compose `1000`.
- `TRACK_TTL_SECONDS`: hoe lang een track zonder nieuwe detectie mag blijven bestaan, standaard in Compose `15`.
- `REGISTERED_TRACK_TTL_SECONDS`: hoe lang een al vastgelegde track detecties blijft absorberen, standaard in Compose `45`. Dit voorkomt dat hetzelfde schip tijdens dezelfde passage opnieuw wordt vastgelegd.
- `EDGE_MARGIN_RATIO`: marge tot de beeldranden (fractie van framegrootte, standaard `0.015`) waarbinnen een schip als volledig in beeld telt. De passagefoto wordt alleen gekozen uit frames waarin het schip volledig in beeld is.
- `SIZE_STABLE_WINDOW` / `SIZE_STABLE_TOLERANCE`: een schip telt pas als volledig in beeld wanneer de bounding box-breedte over de laatste `SIZE_STABLE_WINDOW` waarnemingen (standaard `4`) minder dan `SIZE_STABLE_TOLERANCE` (standaard `0.10`, 10%) varieert. Een binnenvarend schip toont een groeiende box om alleen het zichtbare deel; pas als de breedte stabiel is, is het hele schip in beeld en wordt de foto gemaakt.
- `MOTION_EXTENSION_ENABLED`: standaard `true`. YOLO herkent van lange, vlakke vrachtschepen vaak alleen de stuurhut of boeg. Omdat de hele romp beweegt, wordt de YOLO-box opgerekt met bewegende vlakken die op dezelfde hoogte liggen en horizontaal aansluiten, zodat de box (en daarmee de aspectratio-classificatie) de volledige scheepslengte dekt.
- `MOTION_EXTENSION_MIN_AREA`: minimale contourgrootte voor bewegingsvlakken die een box mogen oprekken, standaard `400`.
- `MOTION_EXTENSION_MAX_HEIGHT_GROWTH`: maximale verticale groei per zijde (fractie van de oorspronkelijke boxhoogte, standaard `0.5`), zodat hekgolven en reflecties de hoogte niet opblazen.
- `SHIP_MERGE_MAX_GAP_RATIO` / `SHIP_MERGE_MIN_VERTICAL_OVERLAP`: losse detecties op hetzelfde schip (boeg en stuurhut apart herkend) worden samengevoegd als ze op dezelfde horizontale band liggen en minder dan `SHIP_MERGE_MAX_GAP_RATIO` (standaard `0.05` van de framebreedte) uit elkaar liggen.
- `VELOCITY_WINDOW`: aantal recente trackpunten waarover de snelheid wordt gemiddeld, standaard `6`. Omdat schepen een redelijk vaste snelheid varen, wordt deze snelheid gebruikt om posities te voorspellen bij gemiste detecties en om duplicaten te herkennen.
- `CENTER_ZONE_X` / `CENTER_ZONE_Y`: zone waarvoor centrering een bonus geeft bij framekeuze, standaard `0.1,0.9` horizontaal en `0.35,0.95` verticaal.
- `PASSAGE_COOLDOWN_SECONDS`: hoe lang recente passages onthouden worden voor duplicaatdetectie, standaard `60`.
- `PASSAGE_DUPLICATE_DISTANCE`: maximale afstand in pixels tussen een nieuwe track en de (op constante snelheid) voorspelde positie van een recente passage om als duplicaat te tellen, standaard `130`.
- `DETECTION_MODE`: `motion` voor debug, `yolo` voor echte scheepsdetectie.
- `REGISTER_MOTION_PASSAGES`: standaard `false`; alleen op `true` zetten voor technische tests, want beweging is geen scheepsherkenning.
- `YOLO_MODEL`: ONNX modelpad wanneer `DETECTION_MODE=yolo` gebruikt wordt.

Na detectie classificeert de detector het schip op basis van de mediane aspectratio (breedte/hoogte van de bounding box) over alle frames waarin het schip volledig in beeld was:

- `cargo` (vrachtschip): heel langgerekt, aspectratio ≥ `CARGO_MIN_ASPECT_RATIO` (standaard `3.0`).
- `sailboat` (zeilboot): hoger dan lang door de mast, aspectratio ≤ `SAILBOAT_MAX_ASPECT_RATIO` (standaard `0.9`).
- `other`: alles daartussenin.

## MVP-grenzen

- Geen echte livestream, alleen snapshots.
- Geen AIS-koppeling in fase 1.
- Geen eigen modeltraining.
- Geen publieke write-acties.
