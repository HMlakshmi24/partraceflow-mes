import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { RecipeService } from '@/lib/services/RecipeService';
import { requireRole, getRequestSession } from '@/lib/api-auth';

const RECIPE_STATUSES = ['DRAFT', 'APPROVED', 'ACTIVE', 'OBSOLETE'];

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR', 'OPERATOR']);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const recipeId = searchParams.get('id');
        const machineId = searchParams.get('machineId');
        const status = searchParams.get('status');

        if (recipeId) {
            const recipe = await prisma.recipe.findUnique({
                where: { id: recipeId },
                include: {
                    parameters: { orderBy: { sequence: 'asc' } },
                    versions: { orderBy: { version: 'desc' } },
                    assignments: {
                        where: { status: { in: ['ACTIVE', 'DOWNLOADED', 'PENDING'] } }
                    }
                }
            });
            if (!recipe) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

            // Enrich with product and machine names
            const [product, machines] = await Promise.all([
                prisma.product.findUnique({ where: { id: recipe.productId } }),
                prisma.machine.findMany({
                    where: { id: { in: recipe.assignments.map(a => a.machineId) } },
                    select: { id: true, name: true }
                })
            ]);
            const machineMap = Object.fromEntries(machines.map(m => [m.id, m]));
            const enriched = {
                ...recipe,
                product,
                machineAssignments: recipe.assignments.map(a => ({
                    ...a,
                    machine: machineMap[a.machineId] ?? { id: a.machineId, name: a.machineId }
                }))
            };
            return NextResponse.json({ recipe: enriched });
        }

        if (machineId) {
            const assignment = await RecipeService.getActiveRecipeForMachine(machineId);
            return NextResponse.json({ assignment });
        }

        const where: any = {};
        if (status) where.status = status;

        const [recipes, products, machines] = await Promise.all([
            prisma.recipe.findMany({
                where,
                include: {
                    parameters: { orderBy: { sequence: 'asc' } },
                    assignments: {
                        where: { status: { in: ['ACTIVE', 'DOWNLOADED', 'PENDING'] } },
                        take: 1
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.product.findMany({ orderBy: { name: 'asc' } }),
            prisma.machine.findMany({ orderBy: { name: 'asc' } })
        ]);

        const productMap = Object.fromEntries(products.map(p => [p.id, p]));
        const machineMap = Object.fromEntries(machines.map(m => [m.id, m]));
        const enrichedRecipes = recipes.map(r => ({
            ...r,
            product: productMap[r.productId],
            machineAssignments: r.assignments.map(a => ({
                ...a,
                machine: machineMap[a.machineId] ?? { id: a.machineId, name: a.machineId }
            }))
        }));

        return NextResponse.json({ recipes: enrichedRecipes, products, machines });
    } catch (error) {
                return handleApiError('[GET /api/recipes]', error);
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR']);
    if (authError) return authError;

    // Bug fix (found via audit): every action below used to attribute
    // creation/approval/assignment to `body.userId` — a client-supplied
    // field, not the authenticated session. Any allowed role could submit
    // `{"userId":"someone-elses-id"}` and have the action permanently
    // recorded against an arbitrary identity in what's otherwise a
    // compliance-relevant approval record. Attribution now always comes
    // from the verified session.
    const session = getRequestSession(req);
    const actorName = session?.username ?? 'SYSTEM';
    const actorUserId = session?.userId;

    try {
        const body = await req.json();
        const { action } = body;

        if (action === 'create') {
            const { code, name, productId, description, parameters } = body;
            if (!code || !name || !productId) {
                return NextResponse.json({ error: 'code, name, productId required' }, { status: 400 });
            }
            const recipe = await RecipeService.createRecipe({
                code, name, productId, description,
                createdBy: actorName,
                createdByUserId: actorUserId,
                parameters: parameters ?? []
            });
            return NextResponse.json({ success: true, recipe });
        }

        if (action === 'approve') {
            const { recipeId } = body;
            if (!recipeId) return NextResponse.json({ error: 'recipeId required' }, { status: 400 });
            const recipe = await RecipeService.approveRecipe(recipeId, actorName, actorUserId);
            return NextResponse.json({ success: true, recipe });
        }

        if (action === 'assign_machine') {
            const { machineId, recipeId } = body;
            if (!machineId || !recipeId) return NextResponse.json({ error: 'machineId and recipeId required' }, { status: 400 });
            const assignment = await RecipeService.assignToMachine({
                machineId, recipeId,
                assignedBy: actorName,
                assignedByUserId: actorUserId,
                workOrderId: body.workOrderId
            });
            return NextResponse.json({ success: true, assignment });
        }

        if (action === 'get_setpoints') {
            const { machineId } = body;
            if (!machineId) return NextResponse.json({ error: 'machineId required' }, { status: 400 });
            const setpoints = await RecipeService.getSetpointsForPLC(machineId);
            return NextResponse.json({ setpoints });
        }

        if (action === 'update_status') {
            const { recipeId, status } = body;
            if (!recipeId || !status) return NextResponse.json({ error: 'recipeId and status required' }, { status: 400 });
            if (!RECIPE_STATUSES.includes(status)) {
                return NextResponse.json({ error: `status must be one of: ${RECIPE_STATUSES.join(', ')}` }, { status: 400 });
            }
            // Bug fix: this generic action used to accept status:'APPROVED'
            // too, letting it silently skip the approve action's own
            // authorization/attribution (approvedBy/approvedAt never got
            // set on a recipe that then reported as approved). Approval
            // must go through the dedicated action.
            if (status === 'APPROVED') {
                return NextResponse.json({ error: 'Use action:"approve" to approve a recipe, not update_status.' }, { status: 400 });
            }
            const recipe = await prisma.recipe.update({
                where: { id: recipeId },
                data: { status }
            });
            return NextResponse.json({ success: true, recipe });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
                return handleApiError('[POST /api/recipes]', error);
    }
}
