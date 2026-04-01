/**
 * MQTT Connector
 *
 * Provides a small wrapper to connect to an MQTT broker and subscribe to topics.
 * This connector is intended for demo and local gateway examples. In production
 * you should run a hardened gateway with proper auth and map device topics to
 * logical machine/tag identifiers before forwarding to MES.
 */

import mqtt from 'mqtt';

export function createMqttClient(brokerUrl: string, opts: mqtt.IClientOptions = {}) {
    const client = mqtt.connect(brokerUrl, opts);
    client.on('connect', () => console.info('MQTT connected to', brokerUrl));
    client.on('error', (err) => console.error('MQTT error', err));
    return client;
}

export function subscribe(client: mqtt.MqttClient, topic: string, handler: (topic: string, payload: Buffer) => void) {
    client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) console.error('Subscribe error', err);
        else console.info('Subscribed to', topic);
    });

    client.on('message', (t: string, payload: Buffer) => {
        // simple topic match: exact or single-level wildcard
        if (t === topic || t.startsWith(topic.replace(/#$/, ''))) handler(t, payload);
    });
}

export default { createMqttClient, subscribe };
