import { prisma } from '@/lib/services/database'

export interface SendNotificationInput {
  channelId: string
  recipientId?: string
  subject: string
  body: string
  priority?: string
  referenceType?: string
  referenceId?: string
}

export class NotificationService {

  static async send(input: SendNotificationInput): Promise<void> {
    const channel = await prisma.notificationChannel.findUnique({
      where: { id: input.channelId }
    })
    if (!channel || !channel.isActive) return

    const notification = await prisma.notification.create({
      data: {
        channelId: input.channelId,
        recipientId: input.recipientId,
        subject: input.subject,
        body: input.body,
        priority: input.priority ?? 'NORMAL',
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: 'PENDING'
      }
    })

    try {
      const config = JSON.parse(channel.config)

      switch (channel.type) {
        case 'WEBHOOK':
          await this.sendWebhook(config.url, notification)
          break
        case 'EMAIL':
          // Production: integrate nodemailer or SendGrid
          console.log(`[Notification] Email to ${config.to}: ${input.subject}`)
          break
        case 'SMS':
          // Production: integrate Twilio or AWS SNS
          console.log(`[Notification] SMS to ${config.to}: ${input.body}`)
          break
        case 'ANDON':
          // Production: publish to MQTT andon topic
          console.log(`[Notification] Andon display update: ${input.subject}`)
          break
        case 'MOBILE_PUSH':
          // Production: integrate Firebase FCM
          console.log(`[Notification] Push to ${config.deviceToken}: ${input.subject}`)
          break
      }

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() }
      })
    } catch (e) {
      console.error(`[NotificationService] Failed to send notification ${notification.id}:`, e)
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED', error: String(e) }
      })
    }
  }

  static async sendByEventType(eventType: string, context: Record<string, string>): Promise<void> {
    const rules = await prisma.notificationRule.findMany({
      where: { eventType, isActive: true },
      include: { channel: true }
    })

    for (const rule of rules) {
      const body = this.interpolateTemplate(rule.template, context)
      await this.send({
        channelId: rule.channelId,
        subject: `[MES] ${eventType}`,
        body,
        priority: 'HIGH'
      })
    }
  }

  private static interpolateTemplate(template: string, context: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? `{{${key}}}`)
  }

  private static async sendWebhook(url: string, payload: object): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) throw new Error(`Webhook failed: ${response.status}`)
  }

  static async getUnread(recipientId: string) {
    return prisma.notification.findMany({
      where: { recipientId, status: { in: ['SENT', 'PENDING'] }, readAt: null },
      orderBy: { createdAt: 'desc' }
    })
  }

  static async markRead(notificationId: string): Promise<void> {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'READ', readAt: new Date() }
    })
  }
}
