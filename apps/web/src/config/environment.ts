type PublicEnvironmentVariable = 'VITE_API_URL' | 'VITE_DEMO_USERS_PASSWORD';

/** Obtém uma configuração pública obrigatória e interrompe a inicialização quando ela está ausente. */
function getRequiredPublicEnvironmentVariable(name: PublicEnvironmentVariable): string {
  const value = import.meta.env[name]?.trim();

  if (!value) {
    throw new Error(`Variável de ambiente pública não definida: ${name}`);
  }

  return value;
}

/** Valida a URL pública usada pelo navegador para acessar a API. */
function getApiUrl(): string {
  const configuredUrl = getRequiredPublicEnvironmentVariable('VITE_API_URL');
  let url: URL;

  try {
    url = new URL(configuredUrl);
  } catch (cause) {
    throw new Error('Variável de ambiente pública VITE_API_URL possui uma URL inválida', {
      cause,
    });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Variável de ambiente pública VITE_API_URL deve usar HTTP ou HTTPS');
  }

  return url.toString().replace(/\/$/, '');
}

// Exige um booleano explícito para que o frontend não exiba o fluxo por configuração ambígua.
function getPublicSignupEnabled(): boolean {
  // O acesso direto permite ao Vite substituir somente esta chave não secreta no build.
  const configuredValue = import.meta.env.PUBLIC_SIGNUP_ENABLED?.trim();

  if (!configuredValue) {
    throw new Error('Variável de ambiente pública não definida: PUBLIC_SIGNUP_ENABLED');
  }

  if (configuredValue !== 'true' && configuredValue !== 'false') {
    throw new Error('Variável de ambiente pública PUBLIC_SIGNUP_ENABLED deve ser true ou false');
  }

  return configuredValue === 'true';
}

export const environment = {
  apiUrl: getApiUrl(),
  // Esta credencial é pública e existe somente para agilizar a avaliação do ambiente demonstrativo.
  demoUsersPassword: getRequiredPublicEnvironmentVariable('VITE_DEMO_USERS_PASSWORD'),
  publicSignupEnabled: getPublicSignupEnabled(),
} as const;
