import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getCompanyInfo, getIvaRate } from '../../../lib/settings';
import {
  buildOrcamentoPdf,
  computeTotals,
  isLocked,
  loadOrcamento,
} from '../../../lib/orcamentos';
import { sendOrcamentoDiretoEmail, generateOrcamentoDiretoWhatsAppLink } from '../../../lib/email';
import { parseItens, parseIncludeIva } from './index';

function getBaseUrl(request: Request) {
  // Usa sempre o host real do pedido (correto em dev e em produção,
  // independentemente do PUBLIC_SITE_URL, que pode estar desatualizado).
  return new URL(request.url).origin.replace(/\/+$/, '');
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const { id } = params;
  const sql = getDb();

  try {
    const form = await request.formData();
    const action = form.get('action')?.toString();

    const loaded = await loadOrcamento(sql, id!);
    if (!loaded) return redirect('/orcamentos?error=not_found');
    const { orc } = loaded;

    // ---------- REMOVER ----------
    if (action === 'delete') {
      await sql`DELETE FROM orcamentos_diretos WHERE id = ${id}`;
      return redirect('/orcamentos?success=deleted');
    }

    // ---------- EDITAR ----------
    if (action === 'update') {
      if (isLocked(orc.status)) return redirect(`/orcamentos?error=locked`);

      const cliente_nome = (form.get('cliente_nome')?.toString() || '').trim();
      if (!cliente_nome) return redirect(`/orcamentos/${id}/editar?error=validation`);

      const statusRaw = form.get('status')?.toString() || orc.status;
      const status = ['rascunho', 'enviado', 'aprovado', 'rejeitado'].includes(statusRaw) ? statusRaw : orc.status;

      // Associação a chamado (vinda do dropdown do formulário).
      let chamadoId: number | null = null;
      const chamadoIdRaw = form.get('chamado_id')?.toString().trim();
      if (chamadoIdRaw) {
        const [ch] = await sql`SELECT id FROM chamados WHERE id = ${chamadoIdRaw} LIMIT 1`;
        if (ch) chamadoId = ch.id;
      }

      const cliente_nif = form.get('cliente_nif')?.toString().trim() || null;
      const cliente_morada = form.get('cliente_morada')?.toString().trim() || null;
      const cliente_codigo_postal = form.get('cliente_codigo_postal')?.toString().trim() || null;
      const cliente_localidade = form.get('cliente_localidade')?.toString().trim() || null;
      const cliente_telefone = form.get('cliente_telefone')?.toString().trim() || null;
      const cliente_email = form.get('cliente_email')?.toString().trim() || null;
      const observacoes = form.get('observacoes')?.toString().trim() || null;
      const validade_dias = Math.max(1, Number.parseInt(form.get('validade_dias')?.toString() || '30', 10) || 30);

      const includeIva = parseIncludeIva(form.get('include_iva'));
      const defaultIva = await getIvaRate(23);
      const ivaRate = includeIva ? defaultIva : 0;

      const descontoTipo = form.get('desconto_tipo')?.toString() === 'percent' ? 'percent' : 'valor';
      const descontoValor = Math.max(0, Number.parseFloat((form.get('desconto_valor')?.toString() || '0').replace(',', '.')) || 0);

      const itens = parseItens(form);
      const { subtotal, total } = computeTotals(itens, includeIva, ivaRate, descontoTipo, descontoValor);

      await sql`
        UPDATE orcamentos_diretos SET
          cliente_nome=${cliente_nome}, cliente_nif=${cliente_nif}, cliente_morada=${cliente_morada},
          cliente_codigo_postal=${cliente_codigo_postal}, cliente_localidade=${cliente_localidade},
          cliente_telefone=${cliente_telefone}, cliente_email=${cliente_email},
          validade_dias=${validade_dias}, observacoes=${observacoes},
          include_iva=${includeIva}, iva_rate=${ivaRate}, desconto_tipo=${descontoTipo}, desconto_valor=${descontoValor},
          subtotal=${subtotal}, total=${total},
          status=${status}, chamado_id=${chamadoId}, updated_at=NOW()
        WHERE id=${id}
      `;
      await sql`DELETE FROM orcamento_direto_itens WHERE orcamento_id=${id}`;
      for (const it of itens) {
        await sql`
          INSERT INTO orcamento_direto_itens (orcamento_id, descricao, quantidade, preco_unitario, ordem)
          VALUES (${id}, ${it.descricao}, ${it.quantidade}, ${it.preco_unitario}, ${it.ordem})
        `;
      }
      return redirect(`/orcamentos/${id}/editar?success=updated`);
    }

    // ---------- ENVIAR EMAIL (PDF anexado) ----------
    if (action === 'send_email') {
      const rawEmails = form.get('to_email')?.toString().trim() || orc.cliente_email || '';
      const targetEmails = rawEmails
        .split(/[;,]/)
        .map((e) => e.trim())
        .filter((e) => e.includes('@'));
      if (targetEmails.length === 0) return redirect(`/orcamentos?error=no_email`);

      const baseUrl = getBaseUrl(request);
      const company = await getCompanyInfo();
      const fresh = await loadOrcamento(sql, id!);
      if (!fresh) return redirect('/orcamentos?error=not_found');

      try {
        const pdfBuffer = await buildOrcamentoPdf(fresh.orc, fresh.itens, baseUrl, company);
        const viewUrl = `${baseUrl}/p/${fresh.orc.public_token}`;
        await sendOrcamentoDiretoEmail({
          toEmail: targetEmails,
          toName: fresh.orc.cliente_nome,
          numero: fresh.orc.numero || `ORC-${fresh.orc.id}`,
          total: Number(fresh.orc.total),
          pdfBuffer,
          viewUrl,
          empresa: company.nome,
        });
        await sql`
          UPDATE orcamentos_diretos
          SET status = CASE WHEN status='rascunho' THEN 'enviado' ELSE status END,
              enviado_via='email', enviado_at=NOW(), updated_at=NOW()
          WHERE id=${id}
        `;
        return redirect(`/orcamentos?success=email_sent`);
      } catch (e: any) {
        console.error('Orcamento email error:', e?.message ?? e);
        return redirect(`/orcamentos?error=email_failed&msg=${encodeURIComponent(e?.message ?? 'unknown')}`);
      }
    }

    // ---------- ENVIAR WHATSAPP (texto + link público) ----------
    if (action === 'send_whatsapp') {
      const targetPhone = form.get('to_phone')?.toString().trim() || orc.cliente_telefone || '';
      if (!targetPhone) return redirect(`/orcamentos?error=no_phone`);

      const baseUrl = getBaseUrl(request);
      const company = await getCompanyInfo();
      const viewUrl = `${baseUrl}/p/${orc.public_token}`;
      const whatsappUrl = generateOrcamentoDiretoWhatsAppLink({
        telefone: targetPhone,
        numero: orc.numero || `ORC-${orc.id}`,
        total: Number(orc.total),
        viewUrl,
        empresa: company.nome,
      });

      await sql`
        UPDATE orcamentos_diretos
        SET status = CASE WHEN status='rascunho' THEN 'enviado' ELSE status END,
            enviado_via='whatsapp', enviado_at=NOW(), updated_at=NOW()
        WHERE id=${id}
      `;
      return redirect(whatsappUrl);
    }

    // ---------- DESASSOCIAR DO AGENDAMENTO ----------
    if (action === 'desassociar_agendamento') {
      await sql`UPDATE orcamentos_diretos SET chamado_id=NULL, updated_at=NOW() WHERE id=${id}`;
      return redirect(`/orcamentos?success=desassociado`);
    }

    // ---------- ASSOCIAR A AGENDAMENTO EXISTENTE ----------
    if (action === 'associar_agendamento') {
      if (orc.chamado_id) return redirect(`/chamados/${orc.chamado_id}`);
      const chamadoId = form.get('chamado_id')?.toString().trim();
      if (!chamadoId) return redirect(`/orcamentos?error=no_chamado`);
      const [chamado] = await sql`
        SELECT id, status, morada, codigo_postal, cidade FROM chamados WHERE id = ${chamadoId} LIMIT 1
      `;
      if (!chamado) return redirect(`/orcamentos?error=no_chamado`);
      if (chamado.status !== 'pendente' && chamado.status !== 'em_andamento') {
        return redirect(`/orcamentos?error=chamado_fechado`);
      }
      // Ao associar, a morada do orçamento passa a refletir a do chamado.
      await sql`
        UPDATE orcamentos_diretos
        SET chamado_id=${chamadoId},
            cliente_morada=${chamado.morada ?? null},
            cliente_codigo_postal=${chamado.codigo_postal ?? null},
            cliente_localidade=${chamado.cidade ?? null},
            updated_at=NOW()
        WHERE id=${id}
      `;
      return redirect(`/chamados/${chamadoId}?success=orcamento_associado`);
    }

    // ---------- CRIAR AGENDAMENTO (gera chamado) ----------
    if (action === 'criar_agendamento') {
      if (orc.chamado_id) return redirect(`/chamados/${orc.chamado_id}`);

      const horario = form.get('horario_agendado')?.toString().trim() || '';
      if (!horario) return redirect(`/orcamentos?error=no_horario`);

      const telefone = orc.cliente_telefone || form.get('cliente_telefone')?.toString().trim() || '';
      const morada = orc.cliente_morada || form.get('cliente_morada')?.toString().trim() || '';
      const cidade = orc.cliente_localidade || form.get('cliente_localidade')?.toString().trim() || '';
      if (!telefone || !morada || !cidade) {
        return redirect(`/orcamentos?error=agendamento_incompleto`);
      }

      const { itens } = (await loadOrcamento(sql, id!))!;
      const linhasItens = itens.map(it => `- ${it.descricao} (x${it.quantidade})`).join('\n');
      const descricao =
        `Agendamento a partir do orçamento ${orc.numero || `ORC-${orc.id}`}.\n` +
        (linhasItens ? `\nServiços/Peças:\n${linhasItens}` : '') +
        (orc.observacoes ? `\n\nObservações: ${orc.observacoes}` : '');

      const [chamado] = await sql`
        INSERT INTO chamados (nome, telefone, email, morada, cidade, codigo_postal, descricao, horario_agendado, status)
        VALUES (
          ${orc.cliente_nome}, ${telefone}, ${orc.cliente_email}, ${morada}, ${cidade},
          ${orc.cliente_codigo_postal}, ${descricao}, ${horario}, 'pendente'
        )
        RETURNING id
      `;
      await sql`UPDATE orcamentos_diretos SET chamado_id=${chamado.id}, updated_at=NOW() WHERE id=${id}`;
      return redirect(`/chamados/${chamado.id}?success=agendamento_criado`);
    }

    return redirect(`/orcamentos`);
  } catch (err) {
    console.error('Orcamento direto action error:', err);
    return redirect(`/orcamentos?error=server`);
  }
};
