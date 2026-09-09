const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};

export function serverEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    fanvueClientId: required("FANVUE_CLIENT_ID"),
    fanvueClientSecret: process.env.FANVUE_CLIENT_SECRET,
    fanvueRedirectUri: required("FANVUE_REDIRECT_URI"),
    fanvueApiBaseUrl: process.env.FANVUE_API_BASE_URL ?? "https://api.fanvue.com",
    fanvueApiVersion: required("FANVUE_API_VERSION"),
    xaiApiKey: process.env.XAI_API_KEY,
    xaiBaseUrl: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
    xaiModel: process.env.XAI_MODEL,
  };
}

export function xaiEnv() {
  return {
    apiKey: process.env.XAI_API_KEY,
    baseUrl: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
    model: process.env.XAI_MODEL,
  };
}