import { prisma } from '@/lib/services/database'

export class SkillService {

  // Check if an operator is qualified for a task/machine
  static async isOperatorQualified(userId: string, skillCategoryCode: string, requiredLevel: number = 1): Promise<boolean> {
    const skill = await prisma.operatorSkill.findFirst({
      where: {
        userId,
        isActive: true,
        category: { code: skillCategoryCode },
        level: { gte: requiredLevel },
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } }
        ]
      },
      include: { certifications: true }
    })

    if (!skill) return false

    // Check certifications are not expired
    const activeCerts = skill.certifications.filter(c =>
      c.status === 'ACTIVE' && (!c.expiresAt || c.expiresAt > new Date())
    )

    return activeCerts.length > 0 || skill.level >= requiredLevel
  }

  // Get qualified operators for a skill
  static async getQualifiedOperators(skillCategoryCode: string, requiredLevel: number = 1) {
    return prisma.user.findMany({
      where: {
        skills: {
          some: {
            isActive: true,
            level: { gte: requiredLevel },
            category: { code: skillCategoryCode },
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } }
            ]
          }
        }
      },
      include: {
        skills: {
          include: { category: true, certifications: true }
        }
      }
    })
  }

  // Record a training completion
  static async recordTraining(data: {
    userId: string
    trainingName: string
    trainingType: string
    score?: number
    passThreshold?: number
    trainerName?: string
    notes?: string
  }) {
    const passed = data.score !== undefined && data.passThreshold !== undefined
      ? data.score >= data.passThreshold
      : true

    return prisma.trainingRecord.create({
      data: {
        userId: data.userId,
        trainingName: data.trainingName,
        trainingType: data.trainingType,
        completedAt: new Date(),
        score: data.score,
        passThreshold: data.passThreshold,
        passed,
        trainerName: data.trainerName,
        notes: data.notes
      }
    })
  }

  // Issue a certification
  static async issueCertification(data: {
    userId: string
    skillCategoryCode: string
    certificationNumber: string
    issuedBy: string
    expiresAt?: Date
    documentPath?: string
  }) {
    // Find or create the skill entry
    const category = await prisma.skillCategory.findUnique({ where: { code: data.skillCategoryCode } })
    if (!category) throw new Error(`Skill category ${data.skillCategoryCode} not found`)

    let skill = await prisma.operatorSkill.findFirst({
      where: { userId: data.userId, categoryId: category.id }
    })

    if (!skill) {
      skill = await prisma.operatorSkill.create({
        data: { userId: data.userId, categoryId: category.id, level: 1, isActive: true }
      })
    }

    return prisma.certification.create({
      data: {
        skillId: skill.id,
        userId: data.userId,
        certificationNumber: data.certificationNumber,
        issuedBy: data.issuedBy,
        issuedAt: new Date(),
        expiresAt: data.expiresAt,
        documentPath: data.documentPath,
        status: 'ACTIVE'
      }
    })
  }

  // Get expiring certifications (for alerts)
  static async getExpiringCertifications(daysAhead: number) {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + daysAhead)

    return prisma.certification.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: futureDate, gte: new Date() }
      },
      include: {
        user: true,
        skill: { include: { category: true } }
      },
      orderBy: { expiresAt: 'asc' }
    })
  }
}
