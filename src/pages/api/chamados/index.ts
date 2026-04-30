import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { sendAgendamentoEmail } from '../../../lib/email';

export const GET: APIRoute = async () => {
  const sql = getDb();
  const chamados = await sql`
    SELECT c.*, u.name as tecnico_nome
    FROM chamados c
    LEFT JOIN users u ON c.tecnico_id = u.id
    ORDER BY c.horario_agendado DESC
    LIMIT 100
  `;
  return new Response(JSON.stringify(chamados), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const formData = await request.formData();
    const nome = formData.get('nome')?.toString().trim();
    const telefone = formData.get('telefone')?.toString().trim();
    const email = formData.get('email')?.toString().trim() || null;
    const morada = formData.get('morada')?.toString().trim();
    const bairro = formData.get('bairro')?.toString().trim() || null;
    const cidade = formData.get('cidade')?.toString().trim();
    const codigo_postal = formData.get('codigo_postal')?.toString().trim() || null;
    const descricao = formData.get('descricao')?.toString().trim();
    const horario_agendado = formData.get('horario_agendado')?.toString();
    const tecnico_id = formData.get('tecnico_id')?.toString() || null;
    const allowConflict = formData.get('allow_conflict')?.toString() === '1';

    if (!nome || !telefone || !morada || !cidade || !descricao || !horario_agendado) {
      return redirect('/chamados/novo?error=validation');
    }

    const sql = getDb();
    const [conflict] = await sql`
      SELECT id
      FROM chamados
      WHERE status NOT IN ('concluido', 'cancelado')
        AND horario_agendado < (${horario_agendado}::timestamp + interval '2 hour')
        AND (horario_agendado + interval '2 hour') > ${horario_agendado}::timestamp
      LIMIT 1
    `;
    if (conflict && !allowConflict) {
      return redirect('/chamados/novo?error=slot_conflict');
    }

    const [chamado] = await sql`
      INSERT INTO chamados (nome, telefone, email, morada, bairro, cidade, codigo_postal, descricao, horario_agendado, tecnico_id)
      VALUES (${nome}, ${telefone}, ${email}, ${morada}, ${bairro}, ${cidade}, ${codigo_postal}, ${descricao}, ${horario_agendado}, ${tecnico_id ? parseInt(tecnico_id) : null})
      RETURNING id
    `;

    if (email) {
      try {
        await sendAgendamentoEmail({
          toEmail: email,
          toName: nome,
          chamadoId: chamado.id,
          horarioAgendado: horario_agendado,
          morada,
          bairro,
          cidade,
          codigoPostal: codigo_postal,
          descricao,
        });
      } catch (mailError) {
        console.error('Create chamado email error:', mailError);
      }
    }

    return redirect(`/chamados/${chamado.id}?success=created`);
  } catch (err) {
    console.error('Create chamado error:', err);
    return redirect('/chamados/novo?error=server');
  }
};
