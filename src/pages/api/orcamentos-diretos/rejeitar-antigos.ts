import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

/** Dias após a criação a partir dos quais um orçamento enviado é considerado antigo. */
export const DIAS_ANTIGO = 30;

// Marca como "rejeitado" todos os orçamentos com estado "enviado"
// criados há mais de DIAS_ANTIGO dias.
export const POST: APIRoute = async ({ redirect }) => {
  const sql = getDb();
  try {
    const rows = await sql`
      UPDATE orcamentos_diretos
      SET status = 'rejeitado', updated_at = NOW()
      WHERE status = 'enviado'
        AND created_at < NOW() - make_interval(days => ${DIAS_ANTIGO})
      RETURNING id
    `;
    return redirect(`/orcamentos?success=rejeitados_antigos&n=${rows.length}`);
  } catch (err) {
    console.error('Rejeitar orcamentos antigos error:', err);
    return redirect('/orcamentos?error=server');
  }
};
