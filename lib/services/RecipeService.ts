import { prisma } from '@/lib/services/database'

export class RecipeService {

  static async createRecipe(data: {
    code: string
    name: string
    productId: string
    description?: string
    createdBy: string
    parameters: {
      parameterName: string
      unit?: string
      nominalValue: string
      minValue?: string
      maxValue?: string
      tolerance?: number
      isSetpoint?: boolean
      plcAddress?: string
      sequence?: number
    }[]
  }) {
    return prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.create({
        data: {
          code: data.code,
          name: data.name,
          productId: data.productId,
          description: data.description,
          createdBy: data.createdBy,
          status: 'DRAFT'
        }
      })

      await tx.recipeParameter.createMany({
        data: data.parameters.map((p, i) => ({
          recipeId: recipe.id,
          parameterName: p.parameterName,
          unit: p.unit,
          nominalValue: p.nominalValue,
          minValue: p.minValue,
          maxValue: p.maxValue,
          tolerance: p.tolerance,
          isSetpoint: p.isSetpoint ?? true,
          plcAddress: p.plcAddress,
          sequence: p.sequence ?? i + 1
        }))
      })

      // Create initial version snapshot
      const params = await tx.recipeParameter.findMany({ where: { recipeId: recipe.id } })
      await tx.recipeVersion.create({
        data: {
          recipeId: recipe.id,
          version: 1,
          parameters: JSON.stringify(params),
          changedBy: data.createdBy,
          changeNote: 'Initial version'
        }
      })

      return recipe
    })
  }

  static async approveRecipe(recipeId: string, approvedBy: string) {
    return prisma.recipe.update({
      where: { id: recipeId },
      data: { status: 'APPROVED', approvedBy, approvedAt: new Date() }
    })
  }

  static async assignToMachine(data: {
    machineId: string
    recipeId: string
    assignedBy: string
    workOrderId?: string
  }) {
    // Mark previous assignment as completed
    await prisma.machineRecipeAssignment.updateMany({
      where: { machineId: data.machineId, status: 'ACTIVE' },
      data: { status: 'COMPLETED' }
    })

    const assignment = await prisma.machineRecipeAssignment.create({
      data: {
        machineId: data.machineId,
        recipeId: data.recipeId,
        assignedBy: data.assignedBy,
        workOrderId: data.workOrderId,
        status: 'PENDING',
        assignedAt: new Date()
      }
    })

    return assignment
  }

  // Get the recipe parameters to download to a PLC
  static async getSetpointsForPLC(machineId: string) {
    const assignment = await prisma.machineRecipeAssignment.findFirst({
      where: { machineId, status: { in: ['PENDING', 'ACTIVE'] } },
      include: {
        recipe: {
          include: { parameters: { where: { isSetpoint: true }, orderBy: { sequence: 'asc' } } }
        }
      }
    })

    if (!assignment) return null

    await prisma.machineRecipeAssignment.update({
      where: { id: assignment.id },
      data: { status: 'DOWNLOADED' }
    })

    return {
      recipeCode: assignment.recipe.code,
      recipeName: assignment.recipe.name,
      setpoints: assignment.recipe.parameters.map(p => ({
        parameterName: p.parameterName,
        value: p.nominalValue,
        unit: p.unit,
        plcAddress: p.plcAddress
      }))
    }
  }

  static async getActiveRecipeForMachine(machineId: string) {
    return prisma.machineRecipeAssignment.findFirst({
      where: { machineId, status: { in: ['ACTIVE', 'DOWNLOADED'] } },
      include: {
        recipe: { include: { parameters: { orderBy: { sequence: 'asc' } } } }
      }
    })
  }
}
