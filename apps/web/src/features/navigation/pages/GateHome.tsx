import { RoleLanding } from '../components/RoleLanding';

export function GateHome() {
  return (
    <RoleLanding
      eyebrow="Operação de portaria"
      title="Pronto para validar"
      description="A operação começará pela seleção explícita do evento antes da leitura de qualquer ingresso."
      operational
    />
  );
}
