import { Button } from '@/components/ui/button';

export interface InfiniteScrollStatusProps {
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  loadingText?: string;
  errorText?: string;
  retryText?: string;
  className?: string;
}

/**
 * Apresenta o estado de carregamento e o fallback de erro para fluxos com paginação infinita.
 */
export function InfiniteScrollStatus({
  isLoading,
  isError,
  onRetry,
  loadingText = 'Carregando mais itens...',
  errorText = 'Não foi possível carregar mais itens.',
  retryText = 'Tentar novamente',
  className = 'py-8 text-center',
}: InfiniteScrollStatusProps) {
  if (isLoading) {
    return (
      <p role="status" className={`text-sm text-muted-foreground ${className}`}>
        {loadingText}
      </p>
    );
  }

  if (isError) {
    return (
      <div className={className}>
        <p role="alert" className="text-sm text-destructive">
          {errorText}
        </p>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2 rounded-[4px]"
          >
            {retryText}
          </Button>
        )}
      </div>
    );
  }

  return null;
}
