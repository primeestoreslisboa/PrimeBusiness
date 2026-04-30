import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../../lib/db';
import { sendOrcamentoEmail, generateWhatsAppLink } from '../../../lib/email';
import { createMbWayPayment, getMbWayPaymentStatus, normalizePtMobile } from '../../../lib/mbway';
import { getIvaRate, getPaymentOptions, getSettingBool } from '../../../lib/settings';

function buildDecisionUrl(baseUrl: string, token: string, decisao: 'aprovar' | 'rejeitar') {
  return `${baseUrl}/api/orcamento/aceitar?token=${encodeURIComponent(token)}&decisao=${decisao}`;
}

function isOrcamentoLocked(status: string | null | undefined) {
  return status === 'aprovado' || status === 'concluido' || status === 'rejeitado';
}

function isOrcamentoConcluido(status: string | null | undefined) {
  return status === 'concluido' || status === 'rejeitado';
}

function canShowDecisionLinks(status: string | null | undefined) {
  return status === 'pendente' || status === 'enviado';
}

function buildMbWayOrderId(orcamentoId: number) {
  return `ORC${orcamentoId}-${Date.now().toString().slice(-6)}`;
}

function parseIncludeIva(raw: FormDataEntryValue | null | undefined) {
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function withIva(baseTotal: number, includeIva: boolean, ivaRate: number) {
  if (!includeIva) return baseTotal;
  return baseTotal * (1 + ivaRate / 100);
}

function parseStoredIvaRate(raw: unknown, fallback: number) {
  const parsed = Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  if (parsed > 100) return 100;
  return parsed;
}

async function computeTotal(sql: any, chamadoId: string, orcamentoId: string | number) {
  const servicos = await sql`
    SELECT quantidade, preco_unitario
    FROM chamado_servicos
    WHERE chamado_id = ${chamadoId} AND orcamento_id = ${orcamentoId}
  `;
  return servicos.reduce((acc: number, s: any) => acc + s.quantidade * parseFloat(s.preco_unitario), 0);
}

async function getLatestOrcamento(sql: any, chamadoId: string) {
  const [latest] = await sql`
    SELECT *
    FROM orcamentos
    WHERE chamado_id = ${chamadoId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return latest;
}

async function getTargetOrcamento(sql: any, chamadoId: string, orcId?: string | null) {
  if (orcId) {
    const [target] = await sql`
      SELECT *
      FROM orcamentos
      WHERE id = ${orcId} AND chamado_id = ${chamadoId}
      LIMIT 1
    `;
    if (target) return target;
  }
  return getLatestOrcamento(sql, chamadoId);
}

async function resetOrcamentoToPending(sql: any, chamadoId: string, targetOrcamentoId?: string | null) {
  const target = await getTargetOrcamento(sql, chamadoId, targetOrcamentoId);
  if (!target) return;

  const total = await computeTotal(sql, chamadoId, target.id);
  const newToken = randomUUID();
  await sql`
    UPDATE orcamentos
    SET
      total = ${total},
      status = 'pendente',
      aceite_token = ${newToken},
      aceite_at = NULL,
      enviado_via = NULL,
      enviado_at = NULL,
      mbway_order_id = NULL,
      mbway_request_id = NULL,
      mbway_reference = NULL,
      mbway_status = NULL,
      mbway_phone = NULL,
      mbway_amount = NULL,
      mbway_requested_at = NULL,
      mbway_paid_at = NULL,
      mbway_last_check_at = NULL
    WHERE id = ${target.id}
  `;
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const { id } = params;
  const sql = getDb();
  const configuredPublicSiteUrl = (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || '').trim();
  const baseUrl = (configuredPublicSiteUrl || new URL(request.url).origin).replace(/\/+$/, '');

  try {
    const formData = await request.formData();
    const action = formData.get('action')?.toString();

    if (action === 'update_iva') {
      const orcId = formData.get('orc_id')?.toString() || null;
      if (!orcId) return redirect(`/tecnico/${id}?error=no_orcamento`);
      const target = await getTargetOrcamento(sql, id!, orcId);
      if (!target) return redirect(`/tecnico/${id}?error=no_orcamento`);
      if (isOrcamentoConcluido(target.status)) return redirect(`/tecnico/${id}?orc=${encodeURIComponent(orcId)}&error=orc_locked`);
      const includeIva = parseIncludeIva(formData.get('include_iva'));
      const currentIvaRate = await getIvaRate(23);
      const appliedIvaRate = includeIva ? currentIvaRate : 0;
      await sql`
        UPDATE orcamentos
        SET include_iva=${includeIva}, iva_rate=${appliedIvaRate}
        WHERE id=${orcId} AND chamado_id=${id}
      `;
      return redirect(`/tecnico/${id}?orc=${encodeURIComponent(orcId)}`);
    }

    if (action === 'add_service') {
      const servico_id = formData.get('servico_id')?.toString();
      const quantidade = parseInt(formData.get('quantidade')?.toString() || '1', 10);
      let preco_unitario = parseFloat(formData.get('preco_unitario')?.toString() || '0');
      const observacao = formData.get('observacao')?.toString() || null;

      if (!servico_id) return redirect(`/tecnico/${id}?error=validation`);

      const orcId = formData.get('orc_id')?.toString() || null;
      if (!orcId) return redirect(`/tecnico/${id}?error=no_orcamento`);
      const target = await getTargetOrcamento(sql, id!, orcId);
      if (!target) return redirect(`/tecnico/${id}?error=no_orcamento`);
      if (isOrcamentoConcluido(target.status)) return redirect(`/tecnico/${id}?orc=${encodeURIComponent(orcId)}&error=orc_locked`);
      if (!Number.isFinite(preco_unitario) || preco_unitario <= 0) {
        const [servico] = await sql`SELECT preco FROM servicos WHERE id=${servico_id} LIMIT 1`;
        const fallbackPreco = parseFloat(String(servico?.preco ?? '0'));
        if (!Number.isFinite(fallbackPreco) || fallbackPreco <= 0) {
          return redirect(`/tecnico/${id}?orc=${encodeURIComponent(orcId)}&error=validation`);
        }
        preco_unitario = fallbackPreco;
      }
      const includeIva = formData.has('include_iva') ? parseIncludeIva(formData.get('include_iva')) : !!target.include_iva;
      const currentIvaRate = await getIvaRate(23);
      const appliedIvaRate = includeIva ? currentIvaRate : 0;
      await sql`
        INSERT INTO chamado_servicos (chamado_id, orcamento_id, servico_id, quantidade, preco_unitario, observacao)
        VALUES (${id}, ${orcId}, ${servico_id}, ${quantidade}, ${preco_unitario}, ${observacao})
      `;
      await sql`
        UPDATE orcamentos
        SET include_iva=${includeIva}, iva_rate=${appliedIvaRate}
        WHERE id=${orcId}
      `;
      await resetOrcamentoToPending(sql, id!, orcId);
      return redirect(`/tecnico/${id}${orcId ? `?orc=${encodeURIComponent(orcId)}` : ''}`);
    }

    if (action === 'remove_service') {
      const orcId = formData.get('orc_id')?.toString() || null;
      if (!orcId) return redirect(`/tecnico/${id}?error=no_orcamento`);
      const target = await getTargetOrcamento(sql, id!, orcId);
      if (!target) return redirect(`/tecnico/${id}?error=no_orcamento`);
      if (isOrcamentoConcluido(target.status)) return redirect(`/tecnico/${id}?orc=${encodeURIComponent(orcId)}&error=orc_locked`);
      const cs_id = formData.get('chamado_servico_id')?.toString();
      await sql`DELETE FROM chamado_servicos WHERE id = ${cs_id} AND chamado_id = ${id} AND orcamento_id = ${orcId}`;
      await resetOrcamentoToPending(sql, id!, orcId);
      return redirect(`/tecnico/${id}${orcId ? `?orc=${encodeURIComponent(orcId)}` : ''}`);
    }

    if (action === 'create_new_orcamento') {
      const [orc] = await sql`
        INSERT INTO orcamentos (chamado_id, total, include_iva, iva_rate, status, aceite_token)
        VALUES (${id}, 0, false, 0, 'pendente', ${randomUUID()})
        RETURNING id
      `;
      return redirect(`/tecnico/${id}?orc=${orc.id}&success=orc_created`);
    }

    if (action === 'cleanup_empty_orcamento') {
      const orc_id = formData.get('orc_id')?.toString();
      if (!orc_id) return new Response(null, { status: 204 });

      const [orc] = await sql`
        SELECT id, status
        FROM orcamentos
        WHERE id=${orc_id} AND chamado_id=${id}
        LIMIT 1
      `;
      if (!orc) return new Response(null, { status: 204 });

      const [svc] = await sql`
        SELECT COUNT(*)::int as total
        FROM chamado_servicos
        WHERE chamado_id = ${id} AND orcamento_id = ${orc_id}
      `;

      if ((svc?.total || 0) === 0 && orc.status === 'pendente') {
        await sql`DELETE FROM orcamentos WHERE id=${orc_id} AND chamado_id=${id}`;
      }

      return new Response(null, { status: 204 });
    }

    if (action === 'save_orcamento' || action === 'send_email' || action === 'send_whatsapp') {
      const selectedOrcId = formData.get('orc_id')?.toString() || null;
      if (!selectedOrcId) return redirect(`/tecnico/${id}?error=no_orcamento`);

      const servicos = await sql`
        SELECT cs.*, s.nome, s.unidade
        FROM chamado_servicos cs
        JOIN servicos s ON s.id = cs.servico_id
        WHERE cs.chamado_id = ${id} AND cs.orcamento_id = ${selectedOrcId}
      `;
      if (servicos.length === 0) return redirect(`/tecnico/${id}?error=no_services`);

      const [chamado] = await sql`SELECT * FROM chamados WHERE id = ${id}`;
      if (!chamado) return redirect(`/tecnico/${id}?error=server`);

      const total = servicos.reduce((acc: number, s: any) => acc + s.quantidade * parseFloat(s.preco_unitario), 0);
      const latestOrc = await getTargetOrcamento(sql, id!, selectedOrcId);
      if (!latestOrc) return redirect(`/tecnico/${id}?error=no_orcamento`);
      if (isOrcamentoConcluido(latestOrc.status)) {
        return redirect(`/tecnico/${id}?orc=${encodeURIComponent(selectedOrcId)}&error=orc_locked`);
      }
      const includeIva = formData.has('include_iva') ? parseIncludeIva(formData.get('include_iva')) : !!latestOrc.include_iva;
      const currentIvaRate = await getIvaRate(23);
      const appliedIvaRate = includeIva ? currentIvaRate : 0;
      const totalFinal = withIva(total, includeIva, appliedIvaRate);
      const mappedServicos = servicos.map((s: any) => ({
        nome: s.nome,
        quantidade: s.quantidade,
        preco_unitario: parseFloat(s.preco_unitario),
        observacao: s.observacao || null,
      }));

      if (action === 'send_email') {
        if (!chamado.email) {
          return redirect(`/tecnico/${id}?error=no_email`);
        }

        try {
          const orc = latestOrc;

          let acceptanceToken = orc.aceite_token || randomUUID();
          if (!orc.aceite_token) {
            await sql`UPDATE orcamentos SET aceite_token=${acceptanceToken} WHERE id=${orc.id}`;
          }
          const includeDecisionLinks = canShowDecisionLinks(orc.status);
          const acceptanceUrl = includeDecisionLinks ? buildDecisionUrl(baseUrl, acceptanceToken, 'aprovar') : undefined;
          const rejectionUrl = includeDecisionLinks ? buildDecisionUrl(baseUrl, acceptanceToken, 'rejeitar') : undefined;

          const paymentOptions = await getPaymentOptions();
          await sendOrcamentoEmail({
            toEmail: chamado.email,
            toName: chamado.nome,
            orcamentoId: Number(orc.id),
            chamadoId: parseInt(id!, 10),
            servicos: mappedServicos,
            total: totalFinal,
            includeIva,
            ivaRate: appliedIvaRate,
            acceptanceUrl,
            rejectionUrl,
            paymentOptions,
          });

          if (orc.status === 'pendente') {
            await sql`
              UPDATE orcamentos
              SET total=${total}, status='enviado', include_iva=${includeIva}, iva_rate=${appliedIvaRate}, enviado_via='email', enviado_at=NOW()
              WHERE id=${orc.id}
            `;
          } else {
            await sql`
              UPDATE orcamentos
              SET total=${total}, include_iva=${includeIva}, iva_rate=${appliedIvaRate}, enviado_via='email', enviado_at=NOW()
              WHERE id=${orc.id}
            `;
          }
          return redirect(`/tecnico/${id}?orc=${orc.id}&success=email_sent`);
        } catch (e: any) {
          console.error('Email error:', e?.message ?? e);
          return redirect(`/tecnico/${id}${selectedOrcId ? `?orc=${encodeURIComponent(selectedOrcId)}&` : '?'}error=email_failed&msg=${encodeURIComponent(e?.message ?? 'unknown')}`);
        }
      }

      if (action === 'send_whatsapp') {
        if (!chamado.telefone) {
          return redirect(`/tecnico/${id}?error=no_phone`);
        }

        const orc = latestOrc;

        let acceptanceToken = orc.aceite_token || randomUUID();
        if (!orc.aceite_token) {
          await sql`UPDATE orcamentos SET aceite_token=${acceptanceToken} WHERE id=${orc.id}`;
        }
        const includeDecisionLinks = canShowDecisionLinks(orc.status);
        const acceptanceUrl = includeDecisionLinks ? buildDecisionUrl(baseUrl, acceptanceToken, 'aprovar') : undefined;
        const rejectionUrl = includeDecisionLinks ? buildDecisionUrl(baseUrl, acceptanceToken, 'rejeitar') : undefined;

        const paymentOptions = await getPaymentOptions();
        const whatsappUrl = generateWhatsAppLink(
          chamado.telefone,
          parseInt(id!, 10),
          mappedServicos,
          totalFinal,
          acceptanceUrl,
          rejectionUrl,
          paymentOptions,
          includeIva,
          appliedIvaRate,
        );

        if (orc.status === 'pendente') {
          await sql`
            UPDATE orcamentos
            SET total=${total}, status='enviado', include_iva=${includeIva}, iva_rate=${appliedIvaRate}, enviado_via='whatsapp', enviado_at=NOW()
            WHERE id=${orc.id}
          `;
        } else {
          await sql`
            UPDATE orcamentos
            SET total=${total}, include_iva=${includeIva}, iva_rate=${appliedIvaRate}, enviado_via='whatsapp', enviado_at=NOW()
            WHERE id=${orc.id}
          `;
        }

        return redirect(whatsappUrl);
      }

      await sql`
        UPDATE orcamentos
        SET
          total = ${total},
          include_iva = ${includeIva},
          iva_rate = ${appliedIvaRate},
          status = 'pendente',
          aceite_token = ${randomUUID()},
          aceite_at = NULL,
          enviado_via = NULL,
          enviado_at = NULL,
          mbway_order_id = NULL,
          mbway_request_id = NULL,
          mbway_reference = NULL,
          mbway_status = NULL,
          mbway_phone = NULL,
          mbway_amount = NULL,
          mbway_requested_at = NULL,
          mbway_paid_at = NULL,
          mbway_last_check_at = NULL
        WHERE id = ${latestOrc.id}
      `;
      return redirect(`/tecnico/${id}?orc=${latestOrc.id}&success=orcamento`);
    }

    if (action === 'update_orcamento') {
      const orc_id = formData.get('orc_id')?.toString();
      const new_status = formData.get('status')?.toString();
      const [orc] = await sql`SELECT status FROM orcamentos WHERE id=${orc_id} AND chamado_id=${id}`;
      if (!orc) return redirect(`/chamados/${id}?error=server`);
      if (isOrcamentoLocked(orc.status)) return redirect(`/chamados/${id}?error=orc_locked&orc=${orc_id}`);

      if (new_status === 'aprovado') {
        await sql`
          UPDATE orcamentos
          SET status=${new_status}, aceite_at = COALESCE(aceite_at, NOW())
          WHERE id=${orc_id} AND chamado_id=${id}
        `;
        await sql`UPDATE chamados SET status='em_andamento', updated_at=NOW() WHERE id=${id}`;
      } else {
        await sql`
          UPDATE orcamentos
          SET status=${new_status}
          WHERE id=${orc_id} AND chamado_id=${id}
        `;
      }

      return redirect(`/chamados/${id}?success=orc_updated&orc=${orc_id}`);
    }

    if (action === 'resend_email') {
      const orc_id = formData.get('orc_id')?.toString();
      const [chamado] = await sql`SELECT * FROM chamados WHERE id = ${id}`;
      const requestedEmail = formData.get('to_email')?.toString().trim() || '';
      const targetEmail = requestedEmail || chamado?.email || '';
      if (!targetEmail) return redirect(`/chamados/${id}?error=no_email&orc=${orc_id}`);

      const servicos = await sql`
        SELECT cs.*, s.nome, s.unidade
        FROM chamado_servicos cs
        JOIN servicos s ON s.id = cs.servico_id
        WHERE cs.chamado_id = ${id} AND cs.orcamento_id = ${orc_id}
      `;
      const [orc] = await sql`SELECT * FROM orcamentos WHERE id=${orc_id}`;
      if (!orc) return redirect(`/chamados/${id}?error=server`);
      if (isOrcamentoLocked(orc.status)) return redirect(`/chamados/${id}?error=orc_locked&orc=${orc_id}`);

      const acceptanceToken = orc.aceite_token || randomUUID();
      if (!orc.aceite_token) {
        await sql`UPDATE orcamentos SET aceite_token=${acceptanceToken} WHERE id=${orc_id}`;
      }
      const includeDecisionLinks = canShowDecisionLinks(orc.status);
      const acceptanceUrl = includeDecisionLinks ? buildDecisionUrl(baseUrl, acceptanceToken, 'aprovar') : undefined;
      const rejectionUrl = includeDecisionLinks ? buildDecisionUrl(baseUrl, acceptanceToken, 'rejeitar') : undefined;
      const currentIvaRate = await getIvaRate(23);
      const includeIva = !!orc.include_iva;
      const appliedIvaRate = includeIva ? parseStoredIvaRate(orc.iva_rate, currentIvaRate) : 0;
      const baseTotal = servicos.reduce((acc: number, s: any) => acc + s.quantidade * parseFloat(s.preco_unitario), 0);
      const totalFinal = withIva(baseTotal, includeIva, appliedIvaRate);

      try {
        const paymentOptions = await getPaymentOptions();
        await sendOrcamentoEmail({
          toEmail: targetEmail,
          toName: chamado.nome,
          orcamentoId: Number(orc.id),
          chamadoId: parseInt(id!, 10),
          servicos: servicos.map((s: any) => ({
            nome: s.nome,
            quantidade: s.quantidade,
            preco_unitario: parseFloat(s.preco_unitario),
            observacao: s.observacao || null,
          })),
          total: totalFinal,
          includeIva,
          ivaRate: appliedIvaRate,
          acceptanceUrl,
          rejectionUrl,
          paymentOptions,
        });

        if (orc.status === 'pendente') {
          await sql`
            UPDATE orcamentos
            SET total=${baseTotal}, iva_rate=${appliedIvaRate}, status='enviado', enviado_via='email', enviado_at=NOW()
            WHERE id=${orc_id}
          `;
        } else {
          await sql`
            UPDATE orcamentos
            SET total=${baseTotal}, iva_rate=${appliedIvaRate}, enviado_via='email', enviado_at=NOW()
            WHERE id=${orc_id}
          `;
        }
        return redirect(`/chamados/${id}?success=email_sent&orc=${orc_id}`);
      } catch (e: any) {
        console.error('Resend email error:', e?.message ?? e);
        return redirect(`/chamados/${id}?error=email_failed&orc=${orc_id}&msg=${encodeURIComponent(e?.message ?? 'unknown')}`);
      }
    }

    if (action === 'resend_whatsapp') {
      const orc_id = formData.get('orc_id')?.toString();
      const [chamado] = await sql`SELECT * FROM chamados WHERE id = ${id}`;
      const requestedPhone = formData.get('to_phone')?.toString().trim() || '';
      const targetPhone = requestedPhone || chamado?.telefone || '';
      if (!targetPhone) return redirect(`/chamados/${id}?error=no_phone&orc=${orc_id}`);
      if (chamado.status === 'concluido' || chamado.status === 'cancelado') {
        return redirect(`/chamados/${id}?error=locked&orc=${orc_id}`);
      }

      const servicos = await sql`
        SELECT cs.*, s.nome, s.unidade
        FROM chamado_servicos cs
        JOIN servicos s ON s.id = cs.servico_id
        WHERE cs.chamado_id = ${id} AND cs.orcamento_id = ${orc_id}
      `;
      const [orc] = await sql`SELECT * FROM orcamentos WHERE id=${orc_id}`;
      if (!orc) return redirect(`/chamados/${id}?error=server`);
      if (isOrcamentoLocked(orc.status)) return redirect(`/chamados/${id}?error=orc_locked&orc=${orc_id}`);

      const acceptanceToken = orc.aceite_token || randomUUID();
      if (!orc.aceite_token) {
        await sql`UPDATE orcamentos SET aceite_token=${acceptanceToken} WHERE id=${orc_id}`;
      }
      const includeDecisionLinks = canShowDecisionLinks(orc.status);
      const acceptanceUrl = includeDecisionLinks ? buildDecisionUrl(baseUrl, acceptanceToken, 'aprovar') : undefined;
      const rejectionUrl = includeDecisionLinks ? buildDecisionUrl(baseUrl, acceptanceToken, 'rejeitar') : undefined;
      const currentIvaRate = await getIvaRate(23);
      const includeIva = !!orc.include_iva;
      const appliedIvaRate = includeIva ? parseStoredIvaRate(orc.iva_rate, currentIvaRate) : 0;
      const baseTotal = servicos.reduce((acc: number, s: any) => acc + s.quantidade * parseFloat(s.preco_unitario), 0);
      const totalFinal = withIva(baseTotal, includeIva, appliedIvaRate);

      const paymentOptions = await getPaymentOptions();
      const whatsappUrl = generateWhatsAppLink(
        targetPhone,
        parseInt(id!, 10),
        servicos.map((s: any) => ({
          nome: s.nome,
          quantidade: s.quantidade,
          preco_unitario: parseFloat(s.preco_unitario),
          observacao: s.observacao || null,
        })),
        totalFinal,
        acceptanceUrl,
        rejectionUrl,
        paymentOptions,
        includeIva,
        appliedIvaRate,
      );

      if (orc.status === 'pendente') {
        await sql`
          UPDATE orcamentos
          SET total=${baseTotal}, iva_rate=${appliedIvaRate}, status='enviado', enviado_via='whatsapp', enviado_at=NOW()
          WHERE id=${orc_id}
        `;
      } else {
        await sql`
          UPDATE orcamentos
          SET total=${baseTotal}, iva_rate=${appliedIvaRate}, enviado_via='whatsapp', enviado_at=NOW()
          WHERE id=${orc_id}
        `;
      }
      return redirect(whatsappUrl);
    }


    if (action === 'charge_mbway') {
      const orc_id = formData.get('orc_id')?.toString();
      const mbwayEnabled = await getSettingBool('mbway_enabled', false);
      if (!mbwayEnabled) return redirect(`/chamados/${id}?error=mbway_disabled&orc=${orc_id}`);

      const [chamado] = await sql`SELECT * FROM chamados WHERE id = ${id}`;
      if (!chamado?.telefone) return redirect(`/chamados/${id}?error=no_phone&orc=${orc_id}`);

      const [orc] = await sql`SELECT * FROM orcamentos WHERE id=${orc_id} AND chamado_id=${id}`;
      if (!orc) return redirect(`/chamados/${id}?error=server`);
      if (orc.status !== 'aprovado') return redirect(`/chamados/${id}?error=mbway_not_allowed&orc=${orc_id}`);

      const phone = normalizePtMobile(chamado.telefone || '');
      if (!phone || phone.length < 9) return redirect(`/chamados/${id}?error=no_phone&orc=${orc_id}`);

      try {
        const currentIvaRate = await getIvaRate(23);
        const appliedIvaRate = !!orc.include_iva ? parseStoredIvaRate(orc.iva_rate, currentIvaRate) : 0;
        const amount = withIva(parseFloat(orc.total), !!orc.include_iva, appliedIvaRate);
        const orderId = buildMbWayOrderId(Number(orc.id));
        const created = await createMbWayPayment({
          amount,
          phone,
          orderId,
        });

        await sql`
          UPDATE orcamentos
          SET
            mbway_order_id = ${orderId},
            mbway_request_id = ${created.requestId},
            mbway_reference = ${created.reference || null},
            mbway_phone = ${phone},
            mbway_amount = ${amount},
            mbway_status = 'pendente',
            mbway_requested_at = NOW(),
            mbway_last_check_at = NOW()
          WHERE id = ${orc_id}
        `;
        return redirect(`/chamados/${id}?success=mbway_requested&orc=${orc_id}`);
      } catch (e: any) {
        console.error('MB WAY charge error:', e?.message ?? e);
        return redirect(`/chamados/${id}?error=mbway_failed&orc=${orc_id}&msg=${encodeURIComponent(e?.message ?? 'unknown')}`);
      }
    }

    if (action === 'check_mbway_status') {
      const orc_id = formData.get('orc_id')?.toString();
      const [orc] = await sql`SELECT * FROM orcamentos WHERE id=${orc_id} AND chamado_id=${id}`;
      if (!orc) return redirect(`/chamados/${id}?error=server`);
      if (!orc.mbway_request_id) return redirect(`/chamados/${id}?error=mbway_not_started&orc=${orc_id}`);

      try {
        const status = await getMbWayPaymentStatus(orc.mbway_request_id);
        const normalizedStatus = status.paid ? 'pago' : status.rejected ? 'rejeitado' : 'pendente';

        await sql`
          UPDATE orcamentos
          SET
            mbway_status = ${normalizedStatus},
            mbway_last_check_at = NOW(),
            mbway_paid_at = CASE WHEN ${status.paid} THEN COALESCE(mbway_paid_at, NOW()) ELSE mbway_paid_at END
          WHERE id = ${orc_id}
        `;

        if (status.paid) {
          return redirect(`/chamados/${id}?success=mbway_paid&orc=${orc_id}`);
        }
        return redirect(`/chamados/${id}?success=mbway_checked&orc=${orc_id}`);
      } catch (e: any) {
        console.error('MB WAY status error:', e?.message ?? e);
        return redirect(`/chamados/${id}?error=mbway_failed&orc=${orc_id}&msg=${encodeURIComponent(e?.message ?? 'unknown')}`);
      }
    }
    if (action === 'delete_orcamento') {
      const orc_id = formData.get('orc_id')?.toString();
      const [orc] = await sql`SELECT status FROM orcamentos WHERE id=${orc_id} AND chamado_id=${id}`;
      if (!orc) return redirect(`/chamados/${id}?error=server`);
      if (isOrcamentoLocked(orc.status)) return redirect(`/chamados/${id}?error=orc_locked&orc=${orc_id}`);
      await sql`DELETE FROM orcamentos WHERE id=${orc_id} AND chamado_id=${id}`;
      return redirect(`/chamados/${id}?success=orc_deleted`);
    }

    return redirect(`/tecnico/${id}`);
  } catch (err) {
    console.error('Orcamento error:', err);
    return redirect(`/chamados/${id}?error=server`);
  }
};
