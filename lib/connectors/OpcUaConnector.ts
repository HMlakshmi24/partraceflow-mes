// OPC-UA Connector for industrial machine data
// Connects to OPC-UA servers, reads/subscribes to node values
// In production: uses node-opcua package
// This file provides the interface + stub implementation

export interface OpcUaConfig {
  endpointUrl: string      // e.g. "opc.tcp://192.168.1.100:4840"
  securityMode: 'None' | 'Sign' | 'SignAndEncrypt'
  username?: string
  password?: string
  clientName: string
}

export interface OpcUaReadResult {
  nodeId: string
  value: string | number | boolean
  quality: 'GOOD' | 'BAD' | 'UNCERTAIN'
  serverTimestamp: Date
  sourceTimestamp: Date
}

export class OpcUaConnector {
  private config: OpcUaConfig
  private connected: boolean = false
  private subscriptions: Map<string, (value: OpcUaReadResult) => void> = new Map()

  constructor(config: OpcUaConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async readNode(nodeId: string): Promise<OpcUaReadResult> {
    if (!this.connected) throw new Error('OPC-UA client not connected')
    return {
      nodeId,
      value: Math.random() * 100,
      quality: 'GOOD',
      serverTimestamp: new Date(),
      sourceTimestamp: new Date()
    }
  }

  async readMultipleNodes(nodeIds: string[]): Promise<OpcUaReadResult[]> {
    const results = await Promise.all(nodeIds.map(id => this.readNode(id)))
    return results
  }

  subscribeToNode(nodeId: string, samplingInterval: number, callback: (value: OpcUaReadResult) => void): void {
    if (!this.connected) throw new Error('OPC-UA client not connected')
    this.subscriptions.set(nodeId, callback)

    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const result: OpcUaReadResult = {
          nodeId,
          value: Math.random() * 100,
          quality: 'GOOD',
          serverTimestamp: new Date(),
          sourceTimestamp: new Date()
        }
        callback(result)
      }, samplingInterval)
    }
  }

  async writeNode(nodeId: string, value: string | number | boolean): Promise<void> {
    if (!this.connected) throw new Error('OPC-UA client not connected')
  }

  isConnected(): boolean {
    return this.connected
  }

  getEndpoint(): string {
    return this.config.endpointUrl
  }
}
