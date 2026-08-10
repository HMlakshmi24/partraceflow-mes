import { prisma } from '@/lib/services/database'
import { createLogger } from '@/lib/logger'

const log = createLogger('NotificationService')

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
          await this.sendEmail(config, notification)
          break
        case 'SMS':
          log.warn('SMS delivery requires external provider (Twilio/AWS SNS). Configure MES_SMS_PROVIDER env.', { channelId: channel.id })
          break
        case 'ANDON':
          await this.sendAndonAlert(config, notification)
          break
        case 'MOBILE_PUSH':
          log.warn('Push notification requires Firebase FCM config. Configure MES_FCM_KEY env.', { channelId: channel.id })
          break
      }

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() }
      })
    } catch (e) {
      log.error('failed to send notification', { notificationId: notification.id, message: e instanceof Error ? e.message : String(e) })
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

  private static async sendEmail(config: { to?: string; webhookUrl?: string }, notification: { subject: string; body: string }): Promise<void> {
    const webhookUrl = config.webhookUrl ?? process.env.MES_EMAIL_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('Email delivery requires a webhook URL. Set MES_EMAIL_WEBHOOK_URL or configure the channel with webhookUrl. Use a service like SendGrid, Mailgun, or your own SMTP relay.');
    }
    const to = config.to;
    if (!to) throw new Error('Email channel missing "to" address in config.');

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        from: process.env.MES_EMAIL_FROM ?? 'mes@factory.local',
        subject: notification.subject,
        text: notification.body,
      }),
    });
    if (!res.ok) throw new Error(`Email webhook failed: ${res.status}`);
  }

  private static async sendAndonAlert(config: { boardId?: string }, notification: { subject: string; body: string }): Promise<void> {
    if (!config.boardId) return;
    await prisma.andonMessage.create({
      data: {
        boardId: config.boardId,
        messageType: 'QUALITY_ALERT',
        content: `${notification.subject}: ${notification.body}`,
        priority: 2,
        displaySeconds: 30,
      }
    });
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
