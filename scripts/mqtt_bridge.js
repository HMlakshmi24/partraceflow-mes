/*
  Simple MQTT -> MES bridge for demo purposes.
  Usage:
    node scripts/mqtt_bridge.js mqtt://localhost:1883

  The bridge subscribes to `rfid/#` and `plc/#` and forwards messages to
  the MES events endpoint `http://localhost:3000/api/events`.
*/

const mqtt = require('mqtt');
const fetch = require('node-fetch');

const broker = process.argv[2] || 'mqtt://localhost:1883';
const client = mqtt.connect(broker);

client.on('connect', () => {
  console.log('Connected to MQTT', broker);
  client.subscribe(['rfid/#', 'plc/#'], { qos: 1 }, (err) => { if (err) console.error('Sub error', err); });
});

client.on('message', async (topic, payload) => {
  try {
    let parsed = null;
    try { parsed = JSON.parse(payload.toString()); } catch { parsed = { raw: payload.toString() }; }
    console.log('MQTT ->', topic, parsed);

    await fetch('http://localhost:3000/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'mqtt-bridge', eventType: topic, details: parsed }),
    });
  } catch (e) { console.error('Forward failed', e); }
});

client.on('error', (e) => console.error('MQTT error', e));
