import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getIvaRate } from '../../../lib/settings';

async function handleUpdate(id: string, formData: FormData, redirect: (path: string) => Response, userRole?: string) {
  const sql = getDb();
  const [current] = await sql`SELECT * FROM chamados WHERE id = ${id}`;
  if (!current) return redirect('/chamados?error=not_found');

  const method = formData.get('_method')?.toString();
  const quickStatus = formData.get('quick_status')?.toString();
  const cancelReason = formData.get('cancel_reason')?.toString().trim() || '';

  if (method === 'DELETE') {
    if (userRole !== 'admin') return redirect(`/chamados/${id}?error=forbidden`);
    await sql`DELETE FROM chamados WHERE id = ${id}`;
    return redirect('/chamados');
  }

  if (quickStatus === 'concluido_com_retorno') {
    const retornoHorario = formData.get('retorno_horario_agendado')?.toString().trim() || '';
    const retornoDescricao = formData.get('retorno_descricao')?.toString().trim() || '';
    const retornoAllowConflict = formData.get('retorno_allow_conflict')?.toString() === '1';
    if (!retornoHorario || !retornoDescricao) {
      return redirect(`/chamados/${id}?error=return_required`);
    }

    const [returnConflict] = await sql`
      SELECT id
      FROM chamados
      WHERE id <> ${id}
        AND status NOT IN ('concluido', 'cancelado')
        AND horario_agendado < (${retornoHorario}::timestamp + interval '2 hour')
        AND (horario_agendado + interval '2 hour') > ${retornoHorario}::timestamp
      LIMIT 1
    `;
    if (returnConflict && !retornoAllowConflict) {
      return redirect(`/chamados/${id}?error=slot_conflict`);
    }

    const [novoChamado] = await sql`
      INSERT INTO chamados (
        nome, telefone, email, morada, bairro, cidade, codigo_postal, descricao,
        horario_agendado, status, tecnico_id
      ) VALUES (
        ${current.nome},
        ${current.telefone},
        ${current.email},
        ${current.morada},
        ${current.bairro},
        ${current.cidade},
        ${current.codigo_postal},
        ${retornoDescricao},
        ${retornoHorario},
        'pendente',
        ${current.tecnico_id}
      )
      RETURNING id
    `;

    await sql`
      UPDATE chamados
      SET
        status = 'concluido',
        cancel_reason = NULL,
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return redirect(`/chamados/${novoChamado.id}?success=created`);
  }

  if (quickStatus === 'confirmar_pagamento') {
    if (current.status !== 'concluido') {
      return redirect(`/chamados/${id}?error=payment_only_concluded`);
    }

    const paymentMethod = formData.get('payment_method')?.toString().trim() || '';
    const allowedPaymentMethods = new Set(['cash', 'bank_transfer', 'mbway', 'other']);
    if (!paymentMethod || !allowedPaymentMethods.has(paymentMethod)) {
      return redirect(`/chamados/${id}?error=payment_method_required`);
    }

    const approvedOrcamentos = await sql`
      SELECT id, total, include_iva, iva_rate
      FROM orcamentos
      WHERE chamado_id = ${id} AND status = 'aprovado'
      ORDER BY COALESCE(aceite_at, created_at) DESC
    `;

    if (!approvedOrcamentos.length) {
      return redirect(`/chamados/${id}?error=no_approved_orcamento`);
    }

    const fallbackIvaRate = await getIvaRate(23);
    const totalFinal = approvedOrcamentos.reduce((acc: number, orc: any) => {
      const baseTotal = Number.parseFloat(String(orc.total ?? '0')) || 0;
      const parsedIvaRate = Number.parseFloat(String(orc.iva_rate ?? '0'));
      const ivaRate = orc.include_iva
        ? (Number.isFinite(parsedIvaRate) && parsedIvaRate > 0 ? Math.min(100, Math.max(0, parsedIvaRate)) : fallbackIvaRate)
        : 0;
      return acc + (orc.include_iva ? baseTotal * (1 + ivaRate / 100) : baseTotal);
    }, 0);

    await sql`
      UPDATE chamados
      SET
        paid_at = NOW(),
        payment_method = ${paymentMethod},
        payment_amount = ${totalFinal},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return redirect(`/chamados/${id}?success=payment_confirmed`);
  }

  if (quickStatus === 'cancelar_pagamento') {
    if (!current.paid_at) {
      return redirect(`/chamados/${id}?error=payment_not_found`);
    }

    await sql`
      UPDATE chamados
      SET
        paid_at = NULL,
        payment_method = NULL,
        payment_amount = NULL,
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return redirect(`/chamados/${id}?success=payment_canceled`);
  }

  if (quickStatus === 'concluido' || quickStatus === 'cancelado') {
    if (quickStatus === 'cancelado' && !cancelReason) {
      return redirect(`/chamados/${id}?error=cancel_reason_required`);
    }
    await sql`
      UPDATE chamados
      SET
        status = ${quickStatus},
        cancel_reason = ${quickStatus === 'cancelado' ? cancelReason : null},
        updated_at = NOW()
      WHERE id = ${id}
    `;
    return redirect(`/chamados/${id}?success=updated`);
  }

  if (current.status === 'concluido' || current.status === 'cancelado') {
    return redirect(`/chamados/${id}?error=locked`);
  }

  const nome = formData.get('nome')?.toString().trim();
  const telefone = formData.get('telefone')?.toString().trim();
  const email = formData.get('email')?.toString().trim() || null;
  const morada = formData.get('morada')?.toString().trim();
  const bairro = formData.get('bairro')?.toString().trim() || null;
  const cidade = formData.get('cidade')?.toString().trim();
  const codigo_postal = formData.get('codigo_postal')?.toString().trim() || null;
  const descricao = formData.get('descricao')?.toString().trim();
  const horario_agendado = formData.get('horario_agendado')?.toString();
  const status = formData.get('status')?.toString() || 'pendente';
  const tecnico_id = formData.get('tecnico_id')?.toString() || null;
  const allowConflict = formData.get('allow_conflict')?.toString() === '1';

  const [scheduleConflict] = await sql`
    SELECT id
    FROM chamados
    WHERE id <> ${id}
      AND status NOT IN ('concluido', 'cancelado')
      AND horario_agendado < (${horario_agendado}::timestamp + interval '2 hour')
      AND (horario_agendado + interval '2 hour') > ${horario_agendado}::timestamp
    LIMIT 1
  `;
  if (scheduleConflict && !allowConflict) {
    return redirect(`/chamados/${id}?error=slot_conflict`);
  }

  await sql`
    UPDATE chamados SET
      nome = ${nome}, telefone = ${telefone}, email = ${email},
      morada = ${morada}, bairro = ${bairro}, cidade = ${cidade},
      codigo_postal = ${codigo_postal}, descricao = ${descricao},
      horario_agendado = ${horario_agendado}, status = ${status},
      tecnico_id = ${tecnico_id ? parseInt(tecnico_id, 10) : null},
      updated_at = NOW()
    WHERE id = ${id}
  `;

  return redirect(`/chamados/${id}?success=updated`);
}

export const PUT: APIRoute = async ({ params, request, redirect, locals }) => {
  const { id } = params;
  if (!id) return redirect('/chamados?error=not_found');

  try {
    const formData = await request.formData();
    return await handleUpdate(id, formData, redirect, locals.user?.role);
  } catch (err) {
    console.error('Update chamado error:', err);
    return redirect(`/chamados/${id}?error=server`);
  }
};

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const sql = getDb();
    const [chamado] = await sql`
      SELECT id, status, updated_at
      FROM chamados
      WHERE id = ${id}
      LIMIT 1
    `;
    if (!chamado) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const orcamentos = await sql`
      SELECT id, status, aceite_at, enviado_at, created_at
      FROM orcamentos
      WHERE chamado_id = ${id}
      ORDER BY created_at DESC
    `;

    const signature = [
      `${chamado.status || ''}`,
      `${chamado.updated_at || ''}`,
      ...orcamentos.map((o: any) => `${o.id}:${o.status || ''}:${o.aceite_at || ''}:${o.enviado_at || ''}`),
    ].join('|');

    return new Response(JSON.stringify({ ok: true, signature }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Get chamado live state error:', error);
    return new Response(JSON.stringify({ error: 'server' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const { id } = params;
  if (!id) return redirect('/chamados?error=not_found');

  try {
    const formData = await request.formData();
    const method = formData.get('_method')?.toString();

    if (method === 'DELETE') {
      if (locals.user?.role !== 'admin') {
        return redirect(`/chamados/${id}?error=forbidden`);
      }
      const sql = getDb();
      await sql`DELETE FROM chamados WHERE id = ${id}`;
      return redirect('/chamados');
    }

    if (method === 'PUT') {
      return await handleUpdate(id, formData, redirect, locals.user?.role);
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (err) {
    console.error('Post chamado error:', err);
    return redirect(`/chamados/${id}?error=server`);
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (locals.user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  const { id } = params;
  const sql = getDb();
  await sql`DELETE FROM chamados WHERE id = ${id}`;
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
