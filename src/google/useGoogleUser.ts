import { useEffect, useState } from 'react';
import { onAuthChange, preloadGoogle, savedUser, type GoogleUser } from './auth';

/** המשתמש המחובר (או null), ומתעדכן בהתחברות והתנתקות */
export function useGoogleUser(): GoogleUser | null {
  const [user, setUser] = useState(savedUser);
  useEffect(() => {
    preloadGoogle();
    return onAuthChange(() => setUser(savedUser()));
  }, []);
  return user;
}
