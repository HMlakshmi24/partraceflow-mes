# Hardware Integration Guide — ParTraceflow MES

This guide explains how to connect shop-floor hardware (PLCs, RFID readers,
and barcode scanners) to the ParTraceflow MES in development and production.

Overview
- Development: use connector stubs in `lib/connectors` for local testing.
- Production: deploy a secure gateway service for each hardware class that
  translates protocol specifics (Modbus/TCP, OPC-UA, MQTT) into REST or
  WebSocket events consumed by the MES.

Recommended Architecture
1. Edge Gateway: small service near the machines that speaks PLC protocol.
2. Authentication: gateways must authenticate with MES (mTLS or API keys).
3. Message Bus: use MQTT or Kafka for scale; MES subscribes to events.
4. Mapping: define tag/point to logical `machineId` and `tagName` in a mapping table.

Quickstart (Local Development)
1. Use `lib/connectors/plcConnector.ts` and `lib/connectors/rfidConnector.ts` stubs.
2. Replace stub calls with the HTTP endpoint exposed by your gateway when ready.
3. For testing without hardware, run a local simulator that posts events to
   `/api/events` (create a small script that posts JSON representing tag reads).

Production Tips
- Use an industrial gateway (e.g., Kepware, Ignition) or a lightweight
  edge container that exposes a secure REST or MQTT bridge.
- Keep PLC credentials off the app server — store them in the gateway.
- Implement retry and idempotency for noisy networks and duplicate reads.

Example: Connecting a PLC via OPC-UA Gateway
1. Configure gateway to map OPC nodes to logical tags (e.g., `M-001/TEMP`).
2. Gateway publishes messages to MQTT topic `plc/M-001/point/TEMP`.
3. MES subscribes to `plc/#` and updates `SystemEvent` and `WorkflowTask` states.

Next steps
- Add real connector implementations in `lib/connectors` that match your
  hardware gateway protocols and security model.
