import { json, serverError, requireOwnerOrRole, notFound } from "@/lib/api";
import { deleteAgendaContribution, getAgendaContribution } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const contribution = await getAgendaContribution(id);
  if (!contribution) return notFound("Contribution not found");
  const { error } = await requireOwnerOrRole(contribution.author_id, "education_officer");
  if (error) return error;
  try {
    await deleteAgendaContribution(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
