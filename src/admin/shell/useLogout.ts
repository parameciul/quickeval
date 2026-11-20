import { useMutation } from '@tanstack/react-query';
import { rememberSignedIn } from '../../landing/account.ts';
import { useApi } from '../ApiContext.tsx';

// The page load after the logout. An object, so a test can spy on it: jsdom
// does not let a test replace window.location.
export const logoutTab = { leave: (path: string) => window.location.assign(path) };

// "Ieși din cont": a new page load then shows the login form.
export function useLogout() {
  const api = useApi();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      rememberSignedIn(false);
      logoutTab.leave('/teacher/');
    },
  });
}
