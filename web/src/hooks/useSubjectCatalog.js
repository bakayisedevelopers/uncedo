import { useEffect, useMemo, useState } from 'react';
import { getFirebaseClients } from '../firebase/config';
import { FALLBACK_SUBJECTS, normalizeSubjectList, toSubjectOptions } from '../constants/subjects';

export function useSubjectCatalog() {
  const [subjectNames, setSubjectNames] = useState([]);
  const subjectOptions = useMemo(() => toSubjectOptions(subjectNames), [subjectNames]);

  const allowedSet = useMemo(
    () => new Set(FALLBACK_SUBJECTS.map((subject) => String(subject).trim().toLowerCase())),
    [],
  );

  useEffect(() => {
    let unsubscribe = null;
    let isMounted = true;

    getFirebaseClients().then((clients) => {
      if (!isMounted || !clients) return;

      const { db, firestoreModule } = clients;
      const { doc, onSnapshot } = firestoreModule;

      unsubscribe = onSnapshot(
        doc(db, 'system', 'subjects'),
        (snapshot) => {
          if (!snapshot.exists()) {
            setSubjectNames([]);
            return;
          }

          const names = normalizeSubjectList(snapshot.data()?.subjectNames || [])
            .filter((name) => allowedSet.has(String(name).trim().toLowerCase()));
          setSubjectNames(names);
        },
        () => setSubjectNames([]),
      );
    }).catch(() => setSubjectNames([]));

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [allowedSet]);

  return {
    subjectNames,
    subjectOptions,
  };
}
