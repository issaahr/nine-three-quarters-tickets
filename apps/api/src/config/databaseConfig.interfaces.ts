/** Opções de conexão compartilhadas pela API e pelo CLI de migrations. */
export interface DatabaseConnectionConfig {
  url: string;
  ssl: false | { rejectUnauthorized: boolean; ca?: string };
}
