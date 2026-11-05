import { useMutation } from '@tanstack/react-query';
import { useApi } from '../ApiContext.tsx';

// "Ieși din cont": a new page load then shows the login form.
export function useLogout() {
  const api = useApi();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => window.location.assign('/admin/'),
  });
}
