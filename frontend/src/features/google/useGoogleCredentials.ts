import {
  useListCredentials,
  useCreateCredentials,
  useValidateCredentials,
  getListCredentialsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { GoogleCredentialsResponse } from '@/api/generated/model'
import { useQueryClient } from '@tanstack/react-query'

export function useGoogleCredentials() {
  const query = useListCredentials()
  return {
    credentials: (query.data?.data ?? []) as GoogleCredentialsResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useCreateCredentialsMutation() {
  const queryClient = useQueryClient()
  return useCreateCredentials({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() }),
    },
  })
}

export function useValidateCredentialsMutation() {
  return useValidateCredentials()
}
