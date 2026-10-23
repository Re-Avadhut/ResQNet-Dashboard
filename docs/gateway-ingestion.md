# ResQnet offline USB gateway integration

## Architecture

ESP-1 (end node), ESP-2 (primary relay), ESP-3 (backup relay) and ESP-4 (gateway) communicate over the existing ESP-NOW mesh. ESP-4 does not join a router or contact an internet service. It writes received reports to its durable local queue, then emits a structured line on its USB serial console:

`RESQNET_BRIDGE_REPORT:{ "gateway_node_id": "...", "source_node_id": "...", "sequence": 123, "payload": "..." }`

A Python bridge running on the PC reads those lines, submits each record to this dashboard's local API, and writes `bridge ack <source_node_id> <sequence>` back over the same USB serial connection only after the API returns a successful response containing `accepted: true`. ESP-4 then persists completion and sends the end-to-end mesh ACK. If the PC or dashboard is unavailable, the gateway retains the record and retries. The API idempotency key is the tuple `(gateway_node_id, source_node_id, sequence)`.

## Start the local dashboard

Use this branch of the dashboard repository. Install its dependencies while internet access is available, then the application can run locally without internet access as long as the dependencies and Node.js are already installed.

In PowerShell, from the dashboard repository folder:

```powershell
npm install
npx prisma generate
$env:RESQNET_GATEWAY_TOKEN = 'replace-with-a-long-random-test-token'
npm run dev
```

The development launcher points Prisma at the repository's local SQLite database. The API is available at `http://127.0.0.1:3000/api/v1/gateway/reports`. The token must be set in the dashboard terminal before starting the server, and must never be committed or put in frontend code.

## Start the USB bridge

The ESP-IDF firmware integration archive includes `tools/usb_gateway_bridge.py`. Extract the firmware project and open a second PowerShell terminal in its `ResQnet` directory. Install pyserial once, then run:

```powershell
py -m venv .venv-bridge
.\.venv-bridge\Scripts\Activate.ps1
python -m pip install pyserial
$env:RESQNET_GATEWAY_TOKEN = 'replace-with-the-same-test-token'
python tools\usb_gateway_bridge.py --port COMx
```

Replace `COMx` with ESP-4's COM port. Use the same token value that is set in the dashboard terminal. Close ESP-IDF Monitor before starting the Python bridge because the bridge must exclusively open the serial port.

The bridge defaults to `http://127.0.0.1:3000/api/v1/gateway/reports`, accepts only localhost API URLs in offline mode, and uses Python's standard HTTP client. It does not require a cloud tunnel, hosted dashboard, router internet access, or a public URL.

## API request payload

`POST /api/v1/gateway/reports` accepts:

```json
{
  "gateway_node_id": "RQ-88F155071AD4",
  "source_node_id": "RQ-78421C6CC474",
  "sequence": 123456789,
  "payload": "\"Medical Emergency\",\"Demo Name\",\"1\",\"Pregnancy emergency\",\"Critical\",\"\",\"\",\"Local test\",\"false\",\"\",\"\",\"\""
}
```

The payload is the existing 12-field phone-portal CSV line. Supported mappings include `Instant SOS` → `RESCUE/CRITICAL`, `Medical Emergency` → `MEDICAL` with severity-based priority, and `Safe & Waiting` → `RESCUE/LOW`. The origin node is attached to the incident. The modular firmware's compact JSON sensor telemetry is handled separately by updating the source node's GPS/IMU module state rather than creating an incident per sample.

The API requires `Authorization: Bearer <RESQNET_GATEWAY_TOKEN>`. It returns `accepted: true` when an emergency report or telemetry record has been handled, including an already stored duplicate. Authentication failures and invalid payloads are not accepted; the PC bridge will not ACK them to the gateway.

## Testing order

1. Run the parser tests with `npx tsx --test tests/resqnet-gateway.test.ts`.
2. Start the local dashboard and send one labelled test report using the PowerShell API smoke test in the firmware archive's `docs/Offline_USB_Gateway_Integration.md`.
3. Confirm one incident is created, then repeat the same request and confirm duplicate suppression.
4. Build the adapted ESP-IDF project locally with `idf.py build`. Do not flash it if the build fails.
5. Flash ESP-4 only, close ESP-IDF Monitor, run the bridge, and submit a clearly labelled report from the end-node phone portal.
6. Confirm that the local dashboard's Incidents queue contains the test report. The gateway log after ACK should contain `REPORT_UPLOADED ... acknowledged_to_mesh=1`.
7. Stop the dashboard briefly and submit a second test. It should remain in ESP-4's durable queue, then be delivered after the dashboard restarts. The record should appear only once.

## Limitations and safety

This is a prototype, not a certified emergency system. Use fictitious test data only. Do not run `idf.py erase-flash`; it can erase persistent IDs, roles and queued reports. The gateway has finite storage, so if the PC remains disconnected until its queue is full, new records cannot be guaranteed to fit.

A local test does not validate a future hosted deployment or production database. The repository's Prisma schema currently uses SQLite; this is suitable for the local demo, but a future multi-instance Vercel deployment needs persistent hosted storage and an appropriate Prisma deployment configuration.