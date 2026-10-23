# ResQNet Dashboard — Feature / Placeholder Audit

Audit date: 2026-10-21  
Scope: source review of `feat/offline-usb-gateway`; not a local production build or live acceptance test.  
Rule: a UI value is “real” only if it comes from current device telemetry or a documented database record; a control is “working” only if its advertised action actually occurs. Simulator and manual-checklist tools may remain for QA, but must never be presented as real hardware behaviour.

## Executive status

The dashboard has a substantial database-backed foundation (authentication, incident workflows, node inventory, resources, shelters, messages, reports, audit records and local backups). However, several parts of the visible interface still show fixed demo values or simulate hardware actions. The current development startup also uses a tracked SQLite database containing seed/demo records, so the overview is not a clean view of only the four physical ResQnet nodes.

## P0 — Data trust and repository security

### Tracked local data and credentials
- `.env` and `db/custom.db` are present in the repository tree.
- `scripts/dev.mjs` forces `DATABASE_URL` to the repository's `db/custom.db`.
- `prisma/seed.ts` explicitly seeds demo accounts with the shared password `resqnet123`, six illustrative `NODE-00x` nodes, illustrative Visakhapatnam-area coordinates, fabricated heartbeat/module values, incidents, survivors, messages and other example records.
- This combination explains why local screens can include nodes and incidents that are not the physical ESP32 devices. API-submitted test incidents can be real while the rest of the screen remains demo data.

Required action:
1. Do not run `db:reset`, re-seed, delete `db/custom.db`, or change the existing local database until it has been backed up.
2. Create a separate clean local demonstration database and an explicit first-admin provisioning path; never use shared demo credentials for a real demonstration.
3. Stop tracking local `.env` and database files. Because they are already in public Git history, removing them from a new commit alone is not sufficient. Review the file and database for exposed secrets, make the repository private while reviewing, rotate any exposed credentials/secrets, and clean history if required.

## P1 — Confirmed fake or misleading runtime UI

### Optional modules: camera, IMU and environment
File: `src/components/pages/dynamic-module-grid.tsx`

- Camera “Request photo capture” waits 700 ms, changes local component state, and displays `QUEUED_FOR_NODE`; it does not issue a camera command or create a queue record.
- IMU Motion is hard-coded to `stable` whenever status is online.
- IMU Tilt is hard-coded to `0.4°`.
- Environment metrics are hard-coded to `28.4°C`, `74%` and `1012 hPa`.
- The source comments explicitly mark these features as mocked.

Required action:
- Remove the camera action and show “not integrated” until a real command/queue/acknowledgement path exists, or implement the complete path before enabling it.
- Read motion/tilt/acceleration/gyro values from stored telemetry. If a value is unavailable, display “not available”, never a default plausible measurement.
- Only show environment readings when a supported environment sensor is actually connected and reports them.

### Node status now uses recent gateway-observed contact (implementation added; build/device acceptance still pending)
Files: `prisma/schema.prisma`, `src/lib/node-runtime.ts`, `src/app/api/v1/gateway/reports/route.ts`, `src/app/api/v1/nodes/route.ts`, `src/app/api/v1/nodes/[nodeId]/route.ts`, `src/app/api/v1/overview/route.ts`

- The node record now has a nullable `last_gateway_contact_at`, kept separate from `NodeHeartbeat`.
- When the authenticated USB gateway submits sensor telemetry or a portal report, the API records the gateway-observed contact timestamp for the source node, the reported last hop when supplied, and the gateway.
- Node inventory, node detail and overview derive runtime state from the newest heartbeat or gateway-observed contact, with a five-minute freshness window. Detail/list displays say “Last contact” and identify whether it came from a device heartbeat or a gateway report.
- Battery, RSSI, uptime and hardware health still come only from actual heartbeat data; the gateway-contact path does not synthesize these values.

Limitations to retain:
- The firmware payload has no source-capture timestamp, so a delayed report drained from the ESP32 queue can refresh gateway-observed contact without proving current radio reachability. “Online” means recent contact evidence was observed by the dashboard, not that the node has been independently polled in real time.
- A node that has not originated a report or been identified as a last hop cannot be declared online merely because another node is sending data. Firmware-level periodic heartbeat/mesh-neighbor status would be needed for authoritative status for every board.
- Module statuses are not yet aged to stale/not-detected when telemetry stops.

Regression tests for runtime derivation have been added to `tests/resqnet-gateway.test.ts`; tests and a full Next.js/Prisma build must still be run locally before acceptance.

### Raw IMU readings are discarded
Files: `src/lib/resqnet-gateway.ts`, `src/app/api/v1/gateway/reports/route.ts`

- The telemetry parser validates fields such as `ax_mg`, `ay_mg`, `az_mg`, `gx_dps10`, `gy_dps10`, `gz_dps10` and `moving`.
- The follow-up implementation on this branch adds nullable `Module.last_sample_json` and `Module.last_sample_received_at` fields, writes the latest validated sample received by the API for the IMU, and clears the sample when telemetry reports the IMU absent. The firmware payload currently has no source-capture timestamp; the UI labels this time as dashboard receive time rather than pretending it is the measurement capture time.
- The IMU UI now shows the firmware motion flag, accelerometer values in mg, gyroscope values converted from 0.1°/s to °/s, and the sample timestamp. It no longer displays the hard-coded “stable” or “0.4°” value.
- The new camera and environment UI states explicitly say those live integrations are unavailable and no photo request or fake environmental measurement is shown.

Remaining verification:
- Apply the additive Prisma schema change to the local database and regenerate Prisma Client.
- Run the parser/sample tests and a complete Next.js build.
- Re-test with a moving/stationary sensor and removal/reconnection. Verify that the UI changes from actual frames, and that no old sample remains displayed after the IMU is reported absent.
- This stores only the latest sample, not a historical time series. A real trend chart would need a separate time-series model and retention policy.

## P1 — Simulator functions that must not be presented as live hardware

### Node Simulator
File: `src/components/pages/node-simulator-panel.tsx`

This is an admin-only test panel that posts synthetic heartbeats and capability reports using a node secret. It is explicitly documented as a simulator. Keep it in a clearly separate QA/test area or disable it for the showcase; do not use its records as proof that an ESP32 performed an action.

### Node queue replay
Files: `src/components/pages/resilience-page.tsx`, `src/app/api/v1/nodes/[nodeId]/queue/route.ts`

The “Node queue simulator” reads and changes dashboard database `Message` rows to simulate replay/expiry. It is not reading or draining the ESP32's durable SPIFFS queue. Keep the simulation label prominent, and do not describe its result as a hardware queue test. Physical queue testing must be performed through the actual USB bridge and gateway ACK logs.

### Offline map simulation
File: `src/components/pages/situation-map-page.tsx`

The “offline tiles” switch is a simulation toggle. It displays “Offline tiles missing”; it does not enable an offline basemap. The page states that online OSM tiles require internet and local tiles must be preloaded.

Required action:
- Remove the simulation toggle from the real-use display. Either implement and verify a local tile package, or truthfully display marker/location records over a “basemap unavailable offline” surface while preserving a usable list of geolocated records.
- Deployment/reference coordinates created by seed data must not be described as live GPS.

### Manual field-test checklist
Files: `src/app/api/v1/system/field-test/route.ts`, `src/app/api/v1/system/field-test/[checklistId]/route.ts`

The checklist definitions are static; pass/fail/skip statuses are operator-recorded database events. One item explicitly says “simulated survivor submission”. This is acceptable as a *manual checklist* if clearly labelled as operator-entered evidence, but the green/pass state is not an automatically run integration test. A future version should capture tester, evidence, timestamp and test environment.

## P1 — False “gateway accepted” wording

Files: `src/app/api/v1/messages/route.ts`, `src/app/api/v1/resources/route.ts`, `src/app/api/v1/shelters/route.ts`

These routes write dashboard database rows and publish an optional local realtime event, then return `accepted_by_gateway: true`. The source code shown here does not deliver the message/resource/shelter data to the physical ESP-4 gateway. In `messages/route.ts`, a known destination can be marked `QUEUED_FOR_NODE` based only on database state.

Required action:
- Change the API response vocabulary to describe what actually happened (for example, `saved: true` or `accepted_by_dashboard: true`), unless a real gateway acknowledgement protocol is implemented.
- Never display `QUEUED_FOR_NODE`, `FORWARDED` or `ACKNOWLEDGED` as hardware delivery state unless those state transitions are driven by physical-device acknowledgements.

## P2 — Features that are database-backed but limited

### Survivor Registry
- `GET /api/v1/survivors` and `GET /api/v1/survivors/{survivorId}` read stored survivor records, and a merge endpoint exists.
- There is no `POST` or `PATCH` in the inspected collection/detail routes. The registry currently appears to be list/filter/select/merge oriented, not a full create/update workflow.
- Do not advertise create/edit capabilities until they exist and are tested.

### Clock drift
File: `src/app/api/v1/system/clock/route.ts`

Clock drift is computed from `node_reported_at` vs `received_at` on the newest stored heartbeat, with the API process's current time labelled `gateway_time`. This can be useful for comparing reported and received timestamps, but does not prove that ESP-4 synchronized clocks or that hardware clocks are accurate. Current simulator-originated heartbeats can also use a server-generated timestamp.

Required action:
- Label the source honestly as API/server time and report “unknown” when there is no actual device heartbeat. Only describe clock synchronisation if the hardware protocol measures it.

### Backups and local SQLite
- Backup operations are database/file backed for local development. The repo's SQLite file is not an appropriate persistence plan for a multi-instance hosted serverless deployment; local success does not prove hosted persistence.
- A clean local demo and a future hosted deployment need separate database configuration and tests.

## Database-backed paths observed in source

These paths have real database writes/reads in the current code and should be kept, while verifying their user-facing status language and error handling:
- Operator login/session and role checks.
- Incident creation, incident status transitions, notes, duplicate/merge workflows and audit entries.
- Node inventory, authenticated heartbeat and capability-report endpoints.
- Resource inventory and shelter records.
- Message records and database-level queue/status simulation.
- Audit log, reports/trends and local database backup functions.
- Gateway API's emergency incident creation and module-presence upserts.

“Database-backed” does not by itself prove that a record reflects a physical device. Each value still needs a traceable source.

## Proposed implementation order

1. **Preserve data and remove demo-data ambiguity:** make a clean local showcase DB path and provide secure initial-operator setup; don't destructively reset the current database.
2. **Fix telemetry trust:** latest IMU sample storage/rendering and gateway-observed node contact are implemented on the feature branch; validate with a local build and hardware test. Module staleness and authoritative per-board heartbeat reporting remain outstanding.
3. **Disable fake hardware actions:** remove/disable mocked camera/environment features until their hardware/API paths exist; clearly separate admin simulator controls.
4. **Fix delivery claims:** replace false gateway-acceptance/queue labels where no physical ACK exists.
5. **Fix offline maps:** either add real local tiles or accurately show that no basemap is available offline.
6. **Complete or clearly scope other modules:** survivor create/update if required, clock-source labelling, and end-to-end tests for each feature.
7. Run regression tests and full local Next.js/Prisma build; then repeat real-device USB/mesh tests. No automatic deployment or merge is part of this audit.

## Verification status

This document is a source audit, not a claim that all findings are already fixed. The local dashboard/API smoke test and USB telemetry delivery were observed in the operator's test session; this environment has not run the full Next.js/Prisma build or a hardware build after any follow-up UI/data-model change.