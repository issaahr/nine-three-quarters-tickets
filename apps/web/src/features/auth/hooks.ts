import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { fetchSession, loginUser, logoutUser } from './api';
import { SessionUser } from './types';

const sessionQueryKey = ['auth', 'session'] as const;

interface UseAuthOptions {
  restoreSession?: boolean;
}

/** Coordena a sessão remota e mantém o cache do TanStack Query como estado autenticado do frontend. */
export function useAuth({ restoreSession = true }: UseAuthOptions = {}) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    enabled: restoreSession,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const loginMutation = useMutation({
    mutationFn: loginUser,
    onSuccess: (data) => {
      const sessionUser: SessionUser = { id: data.id, role: data.role };
      queryClient.setQueryData(sessionQueryKey, sessionUser);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, null);
    },
  });

  return {
    user: sessionQuery.data,
    isLoading: sessionQuery.isLoading,
    sessionError: sessionQuery.error,
    isAuthenticated: Boolean(sessionQuery.data),
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    loginError: loginMutation.error,
    logoutError: logoutMutation.error,
  };
}
