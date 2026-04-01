import { NextRequest } from 'next/server';
import { prisma } from '@/lib/services/database';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { apiError, apiSuccess } from '@/lib/apiResponse';

// Vercel Blob is used in production (BLOB_READ_WRITE_TOKEN set).
// Local filesystem is used in development (no token).
async function storeFile(file: File, safeName: string): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`spool-docs/${safeName}`, file.stream(), {
      access: 'public',
      contentType: file.type || 'application/octet-stream',
    });
    return blob.url;
  }
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'spool-docs');
  await mkdir(uploadDir, { recursive: true });
  const bytes = await file.arrayBuffer();
  await writeFile(join(uploadDir, safeName), Buffer.from(bytes));
  return `/uploads/spool-docs/${safeName}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const spoolId = searchParams.get('spoolId');
    const jointId = searchParams.get('jointId');
    const ncrId = searchParams.get('ncrId');
    const pressureTestId = searchParams.get('pressureTestId');
    const documentType = searchParams.get('documentType');

    if (id) {
      const doc = await prisma.spoolDocument.findFirst({ where: { id } });
      if (!doc) return apiError('Not found', 'DOCUMENT_NOT_FOUND', 404);
      return apiSuccess({ doc });
    }

    const where: any = {};
    if (spoolId) where.spoolId = spoolId;
    if (jointId) where.jointId = jointId;
    if (ncrId) where.ncrId = ncrId;
    if (pressureTestId) where.pressureTestId = pressureTestId;
    if (documentType) where.documentType = documentType;
    

    const docs = await prisma.spoolDocument.findMany({ where, orderBy: { uploadedAt: 'desc' } });
    return apiSuccess({ docs });
  } catch (e) {
    return apiError('Failed to fetch documents', 'DOCUMENT_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';

    // ── Multipart file upload ────────────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return apiError('No file provided', 'NO_FILE', 400);

      const relatedType = (formData.get('relatedType') as string | null) ?? 'SPOOL';
      const relatedId = formData.get('relatedId') as string | null;
      const documentType = (formData.get('documentType') as string | null) ?? 'ATTACHMENT';

      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const publicPath = await storeFile(file, safeName);

      const linkField: any = {};
      if (relatedId) {
        if (relatedType === 'SPOOL')        linkField.spoolId = relatedId;
        else if (relatedType === 'JOINT')   linkField.jointId = relatedId;
        else if (relatedType === 'NCR')     linkField.ncrId = relatedId;
        else if (relatedType === 'NDE')     linkField.ndeId = relatedId;
        else if (relatedType === 'WELD')    linkField.weldId = relatedId;
        else if (relatedType === 'PRESSURE_TEST') linkField.pressureTestId = relatedId;
      }

      const doc = await prisma.spoolDocument.create({
        data: {
          documentType,
          fileName: file.name,
          filePath: publicPath,
          fileSize: file.size,
          mimeType: file.type || null,
          relatedType,
          uploadedBy: 'system',
          ...linkField,
        },
      });
      return apiSuccess({ doc });
    }

    // ── JSON actions ─────────────────────────────────────────────────────────
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'delete' && id) {
      await prisma.spoolDocument.delete({ where: { id } });
      return apiSuccess({ deleted: true });
    }

    if (id) {
      const doc = await prisma.spoolDocument.update({ where: { id }, data });
      return apiSuccess({ doc });
    }

    const doc = await prisma.spoolDocument.create({ data });
    return apiSuccess({ doc });
  } catch (e: any) {
    console.error('[documents]', e);
    return apiError(e.message ?? 'Failed to save document', 'DOCUMENT_SAVE_FAILED', 500);
  }
}
