/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: {
      userId: number;
      email: string;
      role: string;
      name: string;
    };
  }
}

interface ImportMetaEnv {
  readonly DATABASE_URL: string;
  readonly JWT_SECRET: string;
  readonly RESEND_API_KEY: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_AGENDAMENTO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
