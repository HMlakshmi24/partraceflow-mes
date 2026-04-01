# ParTraceflow MES - Enterprise Enhancement Plan

## Current Implementation Status ✅

The following enterprise features are **already implemented**:

| Feature | Status | Location |
|---------|--------|----------|
| Event Bus Architecture | ✅ Implemented | `lib/events/EventBus.ts` |
| Real-time Streaming (SSE) | ✅ Implemented | `app/api/stream/route.ts` |
| Andon Alert System | ✅ Implemented | `lib/services/AndonService.ts` |
| Bottleneck Detection | ✅ Implemented | `lib/services/BottleneckDetectionService.ts` |
| AI MES Copilot (Rule-based) | ✅ Implemented | `lib/services/MESCopilotService.ts` |
| Predictive Maintenance | ✅ Implemented | `lib/services/PredictiveMaintenanceService.ts` |
| SPC (Statistical Process Control) | ✅ Implemented | `lib/services/SPCService.ts` |
| Recipe/Parameter Management | ✅ Implemented | `lib/services/RecipeService.ts` |
| Demo Mode Factory Simulator | ✅ Implemented | `scripts/simulateFactory.ts` |
| Machine Connectivity (OPC UA, Modbus, MQTT) | ✅ Implemented | `lib/connectors/` |
| Digital Twin Models | ✅ Implemented | Prisma schema |
| Downtime Intelligence | ✅ Implemented | `lib/services/DowntimeService.ts` |
| Shift Management | ✅ Implemented | `lib/services/ShiftService.ts` |
| Operator Skills | ✅ Implemented | `lib/services/SkillService.ts` |

---

## Enhancement 1: WebSocket Server for Real-Time Updates

While SSE is implemented, WebSocket provides bidirectional communication for more interactive factory floor applications.

### New Service: WebSocketServer

```typescript
// lib/services/WebSocketServer.ts
import { Server } from 'socket.io'
import { eventBus, MESEvent } from '@/lib/events/EventBus'

let io: Server | null = null

export function initializeWebSocketServer(httpServer: any) {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/api/ws'
  })

  // Subscribe to event bus and broadcast to connected clients
  eventBus.subscribe('*', (event: MESEvent) => {
    if (!io) return
    
    // Broadcast to all clients
    io.emit(event.type, event)
    
    // Room-based routing
    if (event.machineId) {
      io.to(`machine:${event.machineId}`).emit(event.type, event)
    }
    if (event.plantId) {
      io.to(`plant:${event.plantId}`).emit(event.type, event)
    }
  })

  // Handle client connections
  io.on('connection', (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`)

    // Join rooms based on subscription
    socket.on('subscribe:machine', (machineId: string) => {
      socket.join(`machine:${machineId}`)
      console.log(`[WebSocket] ${socket.id} joined machine:${machineId}`)
    })

    socket.on('subscribe:plant', (plantId: string) => {
      socket.join(`plant:${plantId}`)
      console.log(`[WebSocket] ${socket.id} joined plant:${plantId}`)
    })

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`)
    })
  })

  return io
}

export function getIO(): Server | null {
  return io
}
```

### Custom Server Entry Point

```typescript
// server.ts (custom server for Next.js)
import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { initializeWebSocketServer } from './lib/services/WebSocketServer'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  // Initialize WebSocket server
  initializeWebSocketServer(server)

  server.listen(3000, () => {
    console.log('> Ready on http://localhost:3000')
    console.log('> WebSocket server running on ws://localhost:3000/api/ws')
  })
})
```

---

## Enhancement 2: Edge Gateway Application

Create a standalone edge gateway that runs on Raspberry Pi or industrial PC to collect machine data locally.

### Edge Gateway Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Industrial    │      │   Edge Gateway  │      │   MES Server    │
│   Machines      │─────▶│   (Raspberry Pi)│─────▶│   (Cloud/On-prem)│
│   PLCs/RFCs     │      │   - Buffer      │      │   - Database    │
│                 │      │   - Normalize    │      │   - Analytics   │
└─────────────────┘      │   - Compress     │      └─────────────────┘
                         │   - Sync         │
                         └─────────────────┘
```

### Edge Gateway Package

```typescript
// edge-gateway/index.ts
import { OpcUaConnector } from '../lib/connectors/OpcUaConnector'
import { ModbusConnector } from '../lib/connectors/ModbusConnector'
import { MqttConnector } from '../lib/connectors/mqttConnector'

interface EdgeConfig {
  mesServerUrl: string
  edgeId: string
  protocols: {
    opcua?: { endpoint: string }
    modbus?: { host: string; port: number }
    mqtt?: { broker: string; topics: string[] }
  }
  bufferSize: number
  syncIntervalMs: number
}

export class EdgeGateway {
  private config: EdgeConfig
  private buffer: TelemetryPoint[] = []
  private opcua: OpcUaConnector | null = null
  private modbus: ModbusConnector | null = null
  private mqtt: MqttConnector | null = null

  constructor(config: EdgeConfig) {
    this.config = config
  }

  async start(): Promise<void> {
    console.log(`[Edge] Starting edge gateway ${this.config.edgeId}`)
    
    // Initialize protocols
    if (this.config.protocols.opcua) {
      this.opcua = new OpcUaConnector({
        endpointUrl: this.config.protocols.opcua.endpoint,
        securityMode: 'None',
        clientName: `edge-${this.config.edgeId}`
      })
      await this.opcua.connect()
    }

    if (this.config.protocols.modbus) {
      this.modbus = new ModbusConnector({
        host: this.config.protocols.modbus.host,
        port: this.config.protocols.modbus.port
      })
      await this.modbus.connect()
    }

    // Start data collection
    this.startCollection()
    
    // Start sync to MES
    setInterval(() => this.syncToMES(), this.config.syncIntervalMs)
  }

  private async startCollection(): Promise<void> {
    // Collect from OPC UA
    if (this.opcua) {
      setInterval(async () => {
        const signals = await this.getConfiguredSignals('OPCUA')
        for (const nodeId of signals) {
          const value = await this.opcua!.readNode(nodeId)
          this.buffer.push({
            edgeId: this.config.edgeId,
            nodeId,
            value: String(value.value),
            timestamp: new Date()
          })
        }
      }, 1000)
    }

    // Collect from Modbus
    if (this.modbus) {
      setInterval(async () => {
        const registers = await this.modbus!.readHoldingRegisters(0, 10)
        // Process registers...
      }, 1000)
    }
  }

  private async syncToMES(): Promise<void> {
    if (this.buffer.length === 0) return

    const batch = this.buffer.splice(0, this.config.bufferSize)
    
    try {
      await fetch(`${this.config.mesServerUrl}/api/edge/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edgeId: this.config.edgeId, telemetry: batch })
      })
      console.log(`[Edge] Synced ${batch.length} points to MES`)
    } catch (error) {
      console.error('[Edge] Sync failed, rebuffering:', error)
      this.buffer.unshift(...batch)
    }
  }
}

// Run with: npx ts-node edge-gateway/index.ts
```

---

## Enhancement 3: Digital Factory Visualization

Create a real-time 3D factory visualization using Three.js.

### 3D Factory Component

```typescript
// components/Factory3DViewer.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

interface Machine3D {
  id: string
  code: string
  name: string
  status: 'RUNNING' | 'IDLE' | 'DOWN' | 'MAINTENANCE'
  position: [number, number, number]
}

interface FactoryViewerProps {
  machines: Machine3D[]
  onMachineClick?: (machineId: string) => void
}

const statusColors: Record<string, number> = {
  RUNNING: 0x00ff00,      // Green
  IDLE: 0xffff00,         // Yellow
  DOWN: 0xff0000,         // Red
  MAINTENANCE: 0x0088ff   // Blue
}

export default function Factory3DViewer({ machines, onMachineClick }: FactoryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(10, 10, 10)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    containerRef.current.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 20, 10)
    scene.add(directionalLight)

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50)
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2d2d44,
      roughness: 0.8 
    })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.5
    scene.add(floor)

    // Grid
    const grid = new THREE.GridHelper(50, 50, 0x444444, 0x333333)
    scene.add(grid)

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    // Add machines as 3D objects
    const machineMeshes: Map<string, THREE.Mesh> = new Map()

    machines.forEach(machine => {
      // Machine body (box)
      const geometry = new THREE.BoxGeometry(2, 1.5, 2)
      const material = new THREE.MeshStandardMaterial({
        color: statusColors[machine.status] || 0x888888
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(...machine.position)
      mesh.userData = { machineId: machine.id }
      
      scene.add(mesh)
      machineMeshes.set(machine.id, mesh)

      // Add label
      // (Text sprites would be added here)
    })

    // Click handler
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const onMouseClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(Array.from(machineMeshes.values()))

      if (intersects.length > 0) {
        const machineId = intersects[0].object.userData.machineId
        setSelectedMachine(machineId)
        onMachineClick?.(machineId)
      }
    }

    renderer.domElement.addEventListener('click', onMouseClick)

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate)
      
      // Animate running machines
      machines.forEach(machine => {
        const mesh = machineMeshes.get(machine.id)
        if (mesh && machine.status === 'RUNNING') {
          mesh.rotation.y += 0.01
        }
      })

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('click', onMouseClick)
      containerRef.current?.removeChild(renderer.domElement)
    }
  }, [machines])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '600px' }} />
  )
}
```

### Factory Visualization Page

```typescript
// app/factory/page.tsx
'use client'

import { useState, useEffect } from 'react'
import Factory3DViewer from '@/components/Factory3DViewer'

interface MachineData {
  id: string
  code: string
  name: string
  status: string
  position: [number, number, number]
  oee: number
  temperature?: number
}

export default function FactoryVisualizationPage() {
  const [machines, setMachines] = useState<MachineData[]>([])
  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null)
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d')

  useEffect(() => {
    // SSE subscription for real-time updates
    const eventSource = new EventSource('/api/stream')
    
    eventSource.addEventListener('machine.status.changed', (e) => {
      const data = JSON.parse(e.data)
      setMachines(prev => prev.map(m => 
        m.id === data.payload.machineId 
          ? { ...m, status: data.payload.status }
          : m
      ))
    })

    // Initial load
    fetch('/api/machines')
      .then(res => res.json())
      .then(data => setMachines(data.machines || []))

    return () => eventSource.close()
  }, [])

  return (
    <div className="factory-viewer-page">
      <header className="flex justify-between items-center p-4 bg-gray-900">
        <h1 className="text-2xl font-bold text-white">Digital Factory Twin</h1>
        <div className="flex gap-2">
          <button 
            onClick={() => setViewMode('3d')}
            className={`px-4 py-2 rounded ${viewMode === '3d' ? 'bg-cyan-500' : 'bg-gray-700'}`}
          >
            3D View
          </button>
          <button 
            onClick={() => setViewMode('2d')}
            className={`px-4 py-2 rounded ${viewMode === '2d' ? 'bg-cyan-500' : 'bg-gray-700'}`}
          >
            2D View
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Main Viewer */}
        <div className="flex-1">
          {viewMode === '3d' ? (
            <Factory3DViewer 
              machines={machines} 
              onMachineClick={(id) => setSelectedMachine(machines.find(m => m.id === id) || null)}
            />
          ) : (
            <Factory2DGrid machines={machines} onMachineClick={setSelectedMachine} />
          )}
        </div>

        {/* Machine Details Panel */}
        {selectedMachine && (
          <aside className="w-80 bg-gray-800 p-4 text-white">
            <h2 className="text-xl font-bold mb-4">{selectedMachine.name}</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className={`px-2 py-1 rounded ${
                  selectedMachine.status === 'RUNNING' ? 'bg-green-500' :
                  selectedMachine.status === 'DOWN' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`}>{selectedMachine.status}</span>
              </div>
              <div className="flex justify-between">
                <span>OEE:</span>
                <span>{selectedMachine.oee.toFixed(1)}%</span>
              </div>
              {selectedMachine.temperature && (
                <div className="flex justify-between">
                  <span>Temperature:</span>
                  <span>{selectedMachine.temperature}°C</span>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
```

---

## Enhancement 4: Multi-Tenant SaaS Architecture

Add tenant isolation for SaaS deployment.

### New Prisma Models

```prisma
// Add to schema.prisma

model Tenant {
  id            String   @id @default(uuid())
  code          String   @unique // Company identifier
  name          String
  status        String   @default("ACTIVE") // ACTIVE, SUSPENDED, TRIAL
  plan          String   @default("STARTER") // STARTER, PROFESSIONAL, ENTERPRISE
  settings      Json     @default("{}")
  
  // Limits
  maxPlants     Int      @default(1)
  maxMachines   Int      @default(10)
  maxUsers      Int      @default(5)
  
  // Subscription
  subscriptionStart DateTime?
  subscriptionEnd   DateTime?
  
  createdAt     DateTime @default(now())
  
  plants        Plant[]
  users         TenantUser[]
  apiKeys       ApiKey[]
}

model TenantUser {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  role        String   @default("USER") // ADMIN, MANAGER, USER
  
  createdAt   DateTime @default(now())
  
  @@unique([tenantId, userId])
}

model ApiKey {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  name        String
  keyHash     String   // SHA256 of the API key
  permissions Json     @default("[]")
  expiresAt   DateTime?
  lastUsedAt  DateTime?
  isActive    Boolean  @default(true)
  
  createdAt   DateTime @default(now())
}
```

### Tenant Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Extract tenant from subdomain or header
function getTenantId(request: NextRequest): string | null {
  // Option 1: Subdomain (tenant.partraceflow.com)
  const hostname = request.headers.get('host') || ''
  const subdomain = hostname.split('.')[0]
  if (subdomain && subdomain !== 'localhost' && subdomain !== 'www') {
    return subdomain
  }
  
  // Option 2: API key header
  const apiKey = request.headers.get('x-api-key')
  if (apiKey) {
    return getTenantFromApiKey(apiKey)
  }
  
  return null
}

export function middleware(request: NextRequest) {
  const tenantId = getTenantId(request)
  
  if (!tenantId && isProtectedRoute(request.nextUrl.pathname)) {
    // Public routes don't need tenant
    return NextResponse.next()
  }
  
  if (tenantId) {
    // Add tenant ID to headers for downstream use
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-tenant-id', tenantId)
    
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    })
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
}
```

---

## Enhancement 5: API Marketplace & Developer Portal

Expand APIs for external integrations.

### New API Endpoints

```typescript
// app/api/v1/machines/route.ts
import { NextRequest, NextResponse } from 'next/server'

// Rate limiting per tenant
const rateLimiter = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(tenantId: string, limit: number = 100): boolean {
  const now = Date.now()
  const record = rateLimiter.get(tenantId)
  
  if (!record || record.resetTime < now) {
    rateLimiter.set(tenantId, { count: 1, resetTime: now + 60000 })
    return true
  }
  
  if (record.count >= limit) {
    return false
  }
  
  record.count++
  return true
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant required' }, { status: 401 })
  }
  
  if (!checkRateLimit(tenantId)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }
  
  // Get machines for tenant only
  const machines = await prisma.machine.findMany({
    where: { productionLine: { area: { plant: { tenantId } } } },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      oee: true
    }
  })
  
  return NextResponse.json({
    version: '1.0',
    timestamp: new Date().toISOString(),
    machines
  })
}
```

### OpenAPI Documentation

```typescript
// app/api/docs/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const openApiSpec = {
    openapi: '3.0.0',
    info: {
      title: 'ParTraceflow MES API',
      version: '1.0.0',
      description: 'Manufacturing Execution System REST API',
      contact: {
        name: 'API Support',
        email: 'api@partraceflow.com'
      }
    },
    servers: [
      { url: 'https://api.partraceflow.com/v1', description: 'Production' },
      { url: 'https://staging-api.partraceflow.com/v1', description: 'Staging' }
    ],
    paths: {
      '/machines': {
        get: {
          summary: 'List all machines',
          tags: ['Machines'],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'plantId', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      machines: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Machine' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/production': {
        get: {
          summary: 'Get production data',
          tags: ['Production'],
          responses: {
            '200': { description: 'Production data' }
          }
        },
        post: {
          summary: 'Record production',
          tags: ['Production'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProductionRecord' }
              }
            }
          },
          responses: {
            '201': { description: 'Created' }
          }
        }
      }
    },
    components: {
      schemas: {
        Machine: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string', enum: ['IDLE', 'RUNNING', 'DOWN', 'MAINTENANCE'] },
            oee: { type: 'number' }
          }
        }
      }
    }
  }
  
  return NextResponse.json(openApiSpec)
}
```

---

## Enhancement 6: Advanced AI Copilot with Local LLM

Enhance the existing rule-based copilot with local LLM integration.

```typescript
// lib/services/AICopilotService.ts
'use server'

interface LLMConfig {
  provider: 'ollama' | 'openai' | 'anthropic'
  endpoint?: string
  model: string
  apiKey?: string
}

// Connect to local Ollama server
export class AICopilotService {
  private config: LLMConfig
  
  constructor(config: LLMConfig) {
    this.config = config
  }

  // Use hybrid approach: database analysis + LLM formatting
  async generateInsight(question: string, context: any): Promise<string> {
    // First, get relevant data from database (already implemented in MESCopilotService)
    const dbAnalysis = await this.analyzeFromDatabase(question)
    
    if (!this.config.endpoint) {
      // No LLM available, return rule-based response
      return dbAnalysis.answer
    }
    
    // Format with LLM for natural language
    const prompt = `You are a manufacturing expert assistant. 
Based on this MES data analysis, provide a clear, actionable response.

Question: ${question}

Data Analysis:
${JSON.stringify(dbAnalysis.data, null, 2)}

Provide a concise response (2-3 sentences) that answers the question and suggests next actions.`

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          stream: false
        })
      })
      
      const result = await response.json()
      return result.response || dbAnalysis.answer
    } catch (error) {
      console.error('[AICopilot] LLM call failed:', error)
      return dbAnalysis.answer
    }
  }

  private async analyzeFromDatabase(question: string) {
    // Reuse existing MESCopilotService logic
    const { MESCopilotService } = await import('./MESCopilotService')
    return MESCopilotService.query('session', question)
  }
}

// Factory function to get copilot instance
export function getCopilot(): AICopilotService {
  const provider = process.env.LLM_PROVIDER || 'ollama'
  const endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434/api/generate'
  const model = process.env.LLM_MODEL || 'phi3'
  
  return new AICopilotService({
    provider: provider as 'ollama',
    endpoint,
    model
  })
}
```

---

## Enhancement 7: Time-Series Database Integration

Add support for TimescaleDB/InfluxDB for high-volume telemetry.

```typescript
// lib/services/TimeSeriesService.ts
'use server'

// Time-series optimized telemetry queries
// In production, this would use TimescaleDB or InfluxDB directly

export class TimeSeriesService {
  
  // Aggregate telemetry for charting
  static async getAggregatedTelemetry(params: {
    signalId: string
    from: Date
    to: Date
    interval: '1m' | '5m' | '15m' | '1h' | '1d'
    aggregation: 'avg' | 'min' | 'max' | 'sum' | 'count'
  }) {
    // SQLite-compatible aggregation (for development)
    // In production: use TimescaleDB time_bucket() function
    
    const intervalMs = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '1d': 86400000
    }[params.interval]

    const records = await prisma.machineTelemetry.findMany({
      where: {
        signalId: params.signalId,
        timestamp: { gte: params.from, lte: params.to }
      },
      orderBy: { timestamp: 'asc' }
    })

    // Group by interval
    const buckets = new Map<number, number[]>()
    
    records.forEach(record => {
      const bucketTime = Math.floor(record.timestamp.getTime() / intervalMs) * intervalMs
      const existing = buckets.get(bucketTime) || []
      existing.push(parseFloat(record.value))
      buckets.set(bucketTime, existing)
    })

    // Aggregate each bucket
    const aggregationFunc = {
      avg: (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length,
      min: (vals: number[]) => Math.min(...vals),
      max: (vals: number[]) => Math.max(...vals),
      sum: (vals: number[]) => vals.reduce((a, b) => a + b, 0),
      count: (vals: number[]) => vals.length
    }[params.aggregation]

    return Array.from(buckets.entries()).map(([timestamp, values]) => ({
      timestamp: new Date(timestamp),
      value: aggregationFunc(values)
    }))
  }

  // Downsample old data for long-term storage
  static async downsampleOldData(daysOld: number = 90): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    // This would be a raw SQL operation in production
    // SQLite doesn't support native downsampling, so we keep it simple
    return 0
  }

  // Get latest values for all signals on a machine
  static async getLatestSignalValues(machineId: string) {
    const signals = await prisma.machineSignal.findMany({
      where: { machineId, isActive: true },
      include: {
        telemetry: {
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    })

    return signals.map(signal => ({
      signalId: signal.id,
      signalName: signal.signalName,
      value: signal.telemetry[0]?.value,
      unit: signal.unit,
      timestamp: signal.telemetry[0]?.timestamp
    }))
  }
}
```

---

## Summary: Complete Feature Comparison

| Feature | Status | Competitors | ParTraceflow |
|---------|--------|--------------|--------------|
| Basic MES Functions | ✅ | Siemens Opcenter, SAP ME | ✅ Excellent |
| Workflow Engine | ✅ | Most have BPMN | ✅ Advanced token-based |
| Quality Management | ✅ | Standard | ✅ SPC integrated |
| Traceability | ✅ | Standard | ✅ Full genealogy |
| Real-time Events | ✅ | Varies | ✅ Event Bus + SSE |
| WebSocket | 🔄 Optional | Rare | 🔄 Optional upgrade |
| Andon System | ✅ | Some have | ✅ Built-in |
| Bottleneck Detection | ✅ | Rare | ✅ AI-powered |
| AI Copilot | ✅ | Very rare | ✅ Rule-based + LLM |
| Predictive Maintenance | ✅ | Enterprise only | ✅ Health scoring |
| SPC | ✅ | Enterprise only | ✅ Built-in |
| Recipe Management | ✅ | Some have | ✅ Full PLC integration |
| Demo Mode | ✅ | None | ✅ Factory simulator |
| Edge Gateway | 🔄 Basic | Rare | 🔄 Needs full package |
| Digital Twin 3D | 🔄 Optional | Enterprise only | 🔄 Optional upgrade |
| Multi-tenant SaaS | 🔄 Optional | Enterprise only | 🔄 Optional upgrade |
| API Marketplace | 🔄 Basic | Rare | 🔄 Expandable |

---

## Next Steps to Complete

1. **Run the demo simulator**: `npm run demo` or `npx ts-node scripts/simulateFactory.ts`
2. **Test the AI Copilot**: POST to `/api/copilot/analyze` with questions
3. **View real-time events**: Connect to `/api/stream` via SSE
4. **Deploy edge gateway**: Package the connectors for Raspberry Pi

The ParTraceflow MES is already one of the most feature-complete open-source MES platforms available. These enhancements make it enterprise-grade and competitive with commercial solutions costing $100K+.

