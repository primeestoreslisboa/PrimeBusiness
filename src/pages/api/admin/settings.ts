import type { APIRoute } from 'astro';
import { setSetting, setSettingBool } from '../../../lib/settings';

export const POST: APIRoute = async ({ locals, request, redirect }) => {
  if (locals.user?.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const form = await request.formData();
    const mbwayEnabled = form.get('mbway_enabled') === 'on';
    const paymentCashEnabled = form.get('payment_cash_enabled') === 'on';
    const paymentBankTransferEnabled = form.get('payment_bank_transfer_enabled') === 'on';
    const paymentBankIban = form.get('payment_bank_iban')?.toString().trim() || '';
    const paymentMbwayPhoneEnabled = form.get('payment_mbway_phone_enabled') === 'on';
    const paymentMbwayPhone = form.get('payment_mbway_phone')?.toString().trim() || '';
    const ivaRateRaw = form.get('iva_rate')?.toString().trim() || '23';
    const bookingNotifyEmails = form.get('booking_notify_emails')?.toString().trim() || '';
    const bookingNotifyWhatsappNumbers = form.get('booking_notify_whatsapp_numbers')?.toString().trim() || '';
    const bookingNotifyWhatsappCallmebotApiKey = form.get('booking_notify_whatsapp_callmebot_apikey')?.toString().trim() || '';
    const ivaRateNum = Number.parseFloat(ivaRateRaw.replace(',', '.'));
    const ivaRate = Number.isFinite(ivaRateNum) ? Math.min(100, Math.max(0, ivaRateNum)) : 23;

    await setSettingBool('mbway_enabled', mbwayEnabled);
    await setSettingBool('payment_cash_enabled', paymentCashEnabled);
    await setSettingBool('payment_bank_transfer_enabled', paymentBankTransferEnabled);
    await setSetting('payment_bank_iban', paymentBankIban);
    await setSettingBool('payment_mbway_phone_enabled', paymentMbwayPhoneEnabled);
    await setSetting('payment_mbway_phone', paymentMbwayPhone);
    await setSetting('iva_rate', ivaRate.toString());
    await setSetting('booking_notify_emails', bookingNotifyEmails);
    await setSetting('booking_notify_whatsapp_numbers', bookingNotifyWhatsappNumbers);
    await setSetting('booking_notify_whatsapp_callmebot_apikey', bookingNotifyWhatsappCallmebotApiKey);
    return redirect('/admin/configuracoes?success=saved');
  } catch (error) {
    console.error('Settings save error:', error);
    return redirect('/admin/configuracoes?error=server');
  }
};
